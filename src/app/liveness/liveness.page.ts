import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Toast as CapToast } from '@capacitor/toast';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonList,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';

import { QRCodeComponent } from 'angularx-qrcode';
import { TranslateModule } from '@ngx-translate/core';

import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { App } from '@capacitor/app';

interface ProofReply {
  data: any;
}

interface WebhookDetailsReply {
  threadId: string;
  webhookId: string;
  webhookUrl: string;
  verificationResult?: string;
  revealedAttrs?: string; // JSON string from backend
}

@Component({
  selector: 'app-liveness',
  templateUrl: './liveness.page.html',
  styleUrls: ['./liveness.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonList,
    IonButton,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
    QRCodeComponent,
    TranslateModule,
  ],
})
export class LivenessPage implements OnInit, OnDestroy {
  denied = false;

  proofRequestUrl = '';
  deeplink = '';

  private readonly isNative = Capacitor.isNativePlatform();

  // Must match your Android/iOS scheme
  private readonly returnUrl = 'ngayoe://';

  // Webhook config
  private readonly WEBHOOK_ID = 'finalpensionwebhook';

  private currentThreadId: string | null = null;

  // Polling controls
  private polling = false;
  private pollStopAt = 0;
  private pollTimer: any = null;

  // For safety: queue messages until view is entered
  private viewReady = false;
  private pendingToasts: { msg: string; color: 'success' | 'danger' }[] = [];

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    console.log('[NDI][LIVENESS] ngOnInit isNative=', this.isNative);

    // If navigated with ?resume=1 (from AppComponent deep link callback)
    this.route.queryParams.subscribe((qp) => {
      console.log('[NDI][LIVENESS] queryParams:', qp);
      if (qp && qp['resume']) {
        console.log('[NDI][LIVENESS] resume=1 detected -> onWalletReturn()');
        this.onWalletReturn();
      }
    });

    this.resumeIfNeeded();

    // Auto-start if nothing saved
    if (!this.currentThreadId) {
      this.startLogin();
    }
  }

  ionViewWillEnter() {
    console.log('[NDI][LIVENESS] ionViewWillEnter()');
    this.resumeIfNeeded();
  }

  ionViewDidEnter() {
    console.log('[NDI][LIVENESS] ionViewDidEnter()');
    this.viewReady = true;

    // Flush queued toasts
    if (this.pendingToasts.length) {
      const items = [...this.pendingToasts];
      this.pendingToasts = [];
      items.reduce(async (p, t) => {
        await p;
        await this.toastMessage(t.msg, t.color);
      }, Promise.resolve());
    }
  }

  ngOnDestroy(): void {
    console.log('[NDI][LIVENESS] ngOnDestroy() stopping polling');
    this.stopPolling();
  }

  /* ───────────────────────── UI ACTIONS ───────────────────────── */

  openVideoGuide() {
    window.open('https://www.youtube.com/@BhutanNDI', '_blank');
  }

  async startLogin(): Promise<void> {
    console.log('[NDI][LIVENESS] startLogin()');

    localStorage.setItem('ndi_flow', 'liveness');

    this.denied = false;
    this.proofRequestUrl = '';
    this.deeplink = '';
    this.currentThreadId = null;

    localStorage.removeItem('ndi_threadId');
    localStorage.removeItem('ndi_deeplink');

    await this.requestProof();
  }

  async openDeeplink(): Promise<void> {
    console.log('[NDI] openDeeplink() clicked');

    if (!this.deeplink) {
      console.warn('[NDI] openDeeplink() no deeplink found');
      await this.toastMessage(
        'Deeplink not ready. Please refresh QR.',
        'danger'
      );
      return;
    }

    // IMPORTANT: subscribe BEFORE going to wallet
    const threadId = localStorage.getItem('ndi_threadId');
    if (!threadId) {
      console.warn('[NDI] openDeeplink() missing threadId in storage');
      await this.toastMessage('ThreadId missing. Please try again.', 'danger');
      return;
    }

    console.log('[NDI] openDeeplink() threadId=', threadId);

    const ok = await this.prepareWebhook(threadId);
    console.log('[NDI] openDeeplink() prepareWebhook ok=', ok);

    // Optional: show message before switching apps (native toast shows reliably)
    await this.toastMessage('Opening Bhutan NDI Wallet...', 'success');

    console.log(
      '[NDI] openDeeplink() launching wallet deeplink:',
      this.deeplink
    );

    // On native devices, sometimes a tiny delay helps overlays/flush logs
    if (this.isNative) await this.sleep(200);

    window.location.href = this.deeplink;
  }

  async tryAgain(): Promise<void> {
    console.log('[NDI][LIVENESS] tryAgain()');
    await this.startLogin();
  }

  /* ───────────────────────── RESUME / WALLET RETURN ───────────────────────── */

  private resumeIfNeeded() {
    const savedThread = localStorage.getItem('ndi_threadId');
    const savedLink = localStorage.getItem('ndi_deeplink');

    console.log('[NDI][LIVENESS] resumeIfNeeded savedThread=', savedThread);
    console.log('[NDI][LIVENESS] resumeIfNeeded savedLink=', savedLink);

    if (savedLink && !this.deeplink) this.deeplink = savedLink;
    if (savedThread) this.currentThreadId = savedThread;
  }

  /** Called when wallet returns to app (ngayoe://...) */
  private async onWalletReturn(): Promise<void> {
    console.log('[NDI][LIVENESS] onWalletReturn()');

    const threadId =
      this.currentThreadId || localStorage.getItem('ndi_threadId');
    if (!threadId) {
      console.warn('[NDI][LIVENESS] onWalletReturn() no threadId');
      return;
    }

    // safe to call again
    await this.prepareWebhook(threadId);

    console.log('[NDI][LIVENESS] start polling...');
    this.startPollingWebhookDetails(threadId);
  }

  /* ───────────────────────── PROOF REQUEST ───────────────────────── */

  private buildNdiDeepLink(base: string): string {
    if (!base) return base;
    if (base.toLowerCase().includes('returnurl=')) return base;
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}returnUrl=${encodeURIComponent(this.returnUrl)}`;
  }

  private extractProofData(resp: any): {
    threadId: string;
    proofUrl: string;
    deepLink: string;
  } {
    const d = resp?.data ?? resp;

    const threadId = d?.proofRequestThreadId;
    const proofUrl = d?.proofRequestURL;
    const deepLink = d?.deepLinkURL;

    if (!threadId || !proofUrl || !deepLink) {
      throw new Error('Invalid proof-request response (missing fields)');
    }

    return { threadId, proofUrl, deepLink };
  }

  private async requestProof(): Promise<void> {
    console.log('[NDI][LIVENESS] requestProof()');

    const base = 'https://pensionapp.nppf.org.bt/ndi/proof-request-liveness';
    const url = `${base}?returnUrl=${encodeURIComponent(this.returnUrl)}`;

    try {
      console.log('[NDI][LIVENESS] GET:', url);

      const response = await this.getJson<ProofReply>(url);
      console.log('[NDI][LIVENESS] response:', response);

      const { threadId, proofUrl, deepLink } = this.extractProofData(response);

      this.proofRequestUrl = proofUrl;
      this.deeplink = this.buildNdiDeepLink(deepLink);
      this.currentThreadId = threadId;

      localStorage.setItem('ndi_threadId', threadId);
      localStorage.setItem('ndi_deeplink', this.deeplink);

      console.log('[NDI][LIVENESS] saved threadId:', threadId);
      console.log('[NDI][LIVENESS] saved deeplink:', this.deeplink);

      // Prepare webhook immediately
      await this.prepareWebhook(threadId);

      await this.toastMessage(
        'Proof request ready. Open Bhutan NDI Wallet.',
        'success'
      );
    } catch (e: any) {
      console.error('[NDI][LIVENESS] ❌ requestProof failed:', e);
      await this.toastMessage(
        e?.message || 'Failed to obtain proof-request',
        'danger'
      );
    }
  }

  /* ───────────────────────── WEBHOOK FLOW ───────────────────────── */

  private async prepareWebhook(threadId: string): Promise<boolean> {
    try {
      console.log('[NDI][LIVENESS] prepareWebhook() threadId=', threadId);

      // 1) Subscribe
      const subUrl = `https://pensionapp.nppf.org.bt/ndi/webhook/subscribe`;
      const subBody = {
        webhookId: this.WEBHOOK_ID,
        threadId: threadId,
      };

      console.log('[NDI][LIVENESS] POST subscribe:', subUrl, subBody);
      const subResp = await this.postJson<any>(subUrl, subBody);
      console.log('[NDI][LIVENESS] POST subscribe response:', subResp);

      // 2) PUT webhook details
      const putUrl = `https://pensionapp.nppf.org.bt/ndi/webhook-details/${encodeURIComponent(
        threadId
      )}`;
      const putBody = {
        webhookId: this.WEBHOOK_ID,
        webhookUrl: 'https://pensionapp.nppf.org.bt/ndi/webhook',
        authType: 'OAuth2',
        authVersion: 'v2',
        authTokenMode: 'url',
        registerResponse: '{ "statusCode": 201 }',
        subscribeResponse: '{ "statusCode": 200, "message": "Subscribed" }',
      };

      console.log('[NDI][LIVENESS] PUT details:', putUrl, putBody);
      const putResp = await this.putJson<any>(putUrl, putBody);
      console.log('[NDI][LIVENESS] PUT details response:', putResp);

      return true;
    } catch (e) {
      console.error('[NDI][LIVENESS] ❌ prepareWebhook failed:', e);
      return false;
    }
  }

  private startPollingWebhookDetails(threadId: string) {
    if (this.polling) {
      console.log('[NDI][LIVENESS] polling already running');
      return;
    }

    this.polling = true;
    this.pollStopAt = Date.now() + 60_000;

    const tick = async () => {
      if (!this.polling) return;

      if (Date.now() > this.pollStopAt) {
        console.warn('[NDI][LIVENESS] polling timeout');
        this.stopPolling();
        await this.toastMessage(
          'Verification timeout. Please try again.',
          'danger'
        );
        return;
      }

      const done = await this.tryFetchWebhookDetails(threadId);
      if (done) {
        this.stopPolling();
        return;
      }

      this.pollTimer = setTimeout(tick, 2000);
    };

    tick();
  }

  private stopPolling() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async tryFetchWebhookDetails(threadId: string): Promise<boolean> {
    try {
      const url = `https://pensionapp.nppf.org.bt/ndi/webhook-details/${encodeURIComponent(
        threadId
      )}`;
      console.log('[NDI][LIVENESS] GET webhook-details:', url);

      const res = await this.getJson<WebhookDetailsReply>(url);
      console.log('[NDI][LIVENESS] webhook-details response:', res);

      if (!res) return false;

      if (res.verificationResult?.toLowerCase().includes('reject')) {
        this.denied = true;
        await this.toastMessage('Access denied in wallet.', 'danger');
        return true;
      }

      if (res.verificationResult !== 'ProofValidated') return false;

      const cid = this.extractCidFromRevealedAttrs(res.revealedAttrs);
      if (!cid) return false;

      console.log('[NDI][LIVENESS] ✅ CID -> checkLiveliness:', cid);

      await this.checkLiveliness(cid);

      localStorage.removeItem('ndi_threadId');
      localStorage.removeItem('ndi_deeplink');

      return true;
    } catch (e) {
      console.error('[NDI][LIVENESS] ❌ tryFetchWebhookDetails failed:', e);
      return false;
    }
  }

  private extractCidFromRevealedAttrs(revealedAttrs?: string): string | null {
    if (!revealedAttrs) return null;
    try {
      const obj = JSON.parse(revealedAttrs);
      const cid = obj?.['ID Number']?.[0]?.value;
      return cid ? String(cid).trim() : null;
    } catch (e) {
      console.error('[NDI][LIVENESS] JSON parse failed:', e);
      return null;
    }
  }

  /* ───────────────────────── LIVELINESS CHECK ───────────────────────── */

  private async checkLiveliness(cid: string): Promise<void> {
    const storedCid = localStorage.getItem('cidNumber');
    const pensionId = localStorage.getItem('pensionId');

    const livelinessStatus =
      storedCid && storedCid !== cid ? 'Invalid' : 'Valid';

    const url = `https://pensionapp.nppf.org.bt/api/liveliness`;
    const payload = { pensionId, cidNumber: cid, livelinessStatus };

    console.log('[NDI][LIVENESS] POST liveliness:', url, payload);

    try {
      const response: any = await this.postJson<any>(url, payload);

      const statusOk =
        response?.status === true ||
        response?.status === 'true' ||
        response?.status === 1;

      if (statusOk && livelinessStatus === 'Valid') {
        await this.toastMessage('Liveliness verified successfully', 'success');

        this.zone.run(() => {
          this.router.navigate(['/home'], { replaceUrl: true });
        });
        return;
      }

      if (livelinessStatus === 'Invalid') {
        await this.toastMessage('CID mismatched. Please try again.', 'danger');
        return;
      }

      await this.toastMessage(
        response?.message || 'Liveliness verification failed.',
        'danger'
      );
    } catch (e: any) {
      console.error('[NDI][LIVENESS] checkLiveliness failed:', e);
      await this.toastMessage(
        e?.error?.message || e?.message || 'Server error. Try again later.',
        'danger'
      );
    }
  }

  /* ───────────────────────── ✅ TOAST (APK SAFE) ───────────────────────── */

  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    // queue if view not ready yet
    if (!this.viewReady) {
      this.pendingToasts.push({ msg, color });
      return;
    }

    // Always run inside Angular zone
    return await this.zone.run(async () => {
      // ✅ Native (APK) => use Capacitor Toast (most reliable)
      if (this.isNative) {
        try {
          await CapToast.show({
            text: msg,
            duration: 'short',
            position: 'top',
          });
          return;
        } catch (e) {
          console.error('[TOAST] CapToast failed, fallback to Ionic', e);
          // fall through to Ionic
        }
      }

      // ✅ Web (or fallback) => Ionic ToastController
      try {
        const t = await this.toast.create({
          message: msg,
          duration: 3500,
          color,
          position: 'top',
        });
        await t.present();
      } catch (e) {
        console.error('[TOAST] Ionic toast failed', e);
      }
    });
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ───────────────────────── HTTP HELPERS (WITH HARD TIMEOUTS) ───────────────────────── */

  private async withHardTimeout<T>(
    p: Promise<T>,
    ms: number,
    label: string
  ): Promise<T> {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, rej) => {
      timer = setTimeout(() => {
        rej(
          new Error(`[NDI][LIVENESS] HARD TIMEOUT after ${ms}ms at ${label}`)
        );
      }, ms);
    });

    try {
      return await Promise.race([p, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    if (this.isNative) {
      const req = (async () => {
        const res: HttpResponse = await CapacitorHttp.get({
          url,
          headers: { Accept: 'application/json' },
          connectTimeout: 20000,
          readTimeout: 20000,
        });

        if (res.status && res.status >= 400) {
          throw new Error(`HTTP ${res.status} for GET ${url}`);
        }

        let data: any = res.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {}
        }
        return (data ?? {}) as T;
      })();

      return await this.withHardTimeout(req, 25000, `GET ${url}`);
    }

    return await firstValueFrom(this.http.get<T>(url).pipe(timeout(20000)));
  }

  private async postJson<T>(url: string, body: any): Promise<T> {
    if (this.isNative) {
      const req = (async () => {
        const res: HttpResponse = await CapacitorHttp.post({
          url,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          data: body,
          connectTimeout: 20000,
          readTimeout: 20000,
        });

        if (res.status && res.status >= 400) {
          throw new Error(`HTTP ${res.status} for POST ${url}`);
        }

        let data: any = res.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {}
        }
        return (data ?? {}) as T;
      })();

      return await this.withHardTimeout(req, 25000, `POST ${url}`);
    }

    return await firstValueFrom(
      this.http.post<T>(url, body).pipe(timeout(20000))
    );
  }

  private async putJson<T>(url: string, body: any): Promise<T> {
    if (this.isNative) {
      const req = (async () => {
        const res: HttpResponse = await CapacitorHttp.put({
          url,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          data: body,
          connectTimeout: 20000,
          readTimeout: 20000,
        });

        if (res.status && res.status >= 400) {
          throw new Error(`HTTP ${res.status} for PUT ${url}`);
        }

        let data: any = res.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {}
        }
        return (data ?? {}) as T;
      })();

      return await this.withHardTimeout(req, 25000, `PUT ${url}`);
    }

    return await firstValueFrom(
      this.http.put<T>(url, body).pipe(timeout(20000))
    );
  }
}
