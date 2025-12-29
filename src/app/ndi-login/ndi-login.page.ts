import { Component, OnDestroy, OnInit, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonButton,
  IonSpinner,
  IonList,
} from '@ionic/angular/standalone';

import { QRCodeComponent } from 'angularx-qrcode';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageToggleComponent } from '../shared/language-toggle.component';

import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

// ✅ Capacitor HTTP + Toast
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Toast as CapToast } from '@capacitor/toast';

interface ProofReply {
  data: {
    proofRequestURL: string;
    deepLinkURL: string;
    proofRequestThreadId: string;
    proofRequestName?: string;
  };
}

interface WebhookDetailsReply {
  threadId: string;
  webhookId: string;
  webhookUrl: string;
  authType?: string;
  authVersion?: string;
  authTokenMode?: string;
  registerResponse?: string;
  subscribeResponse?: string;
  verificationResult?: string;
  schemaId?: string;
  relationshipDid?: string;
  holderDid?: string;

  // IMPORTANT: revealedAttrs is a STRING (JSON string)
  revealedAttrs?: string;

  selfAttestedAttrs?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-ndi-login',
  templateUrl: './ndi-login.page.html',
  styleUrls: ['./ndi-login.page.scss'],
  standalone: true,
  imports: [
    IonList,
    IonSpinner,
    IonButton,
    IonContent,
    CommonModule,
    FormsModule,
    QRCodeComponent,
    TranslateModule,
    LanguageToggleComponent,
  ],
})
export class NdiLoginPage implements OnInit, OnDestroy {
  step: 'welcome' | 'qr' = 'welcome';
  loading = false;

  proofRequestUrl = '';
  deeplink = '';
  denied = false;

  private readonly isNative = Capacitor.isNativePlatform();

  // Must match your Android/iOS scheme
  private readonly returnUrl = 'ngayoe://';

  // Polling controls
  private polling = false;
  private pollStopAt = 0;

  // Webhook config
  private readonly WEBHOOK_ID = 'finalpensionwebhook';

  // ✅ same lock pattern as old login
  private loggingIn = false;

  // ✅ Toast safety (same as liveness)
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
    console.log('[NDI] ngOnInit()');

    this.route.queryParams.subscribe((qp) => {
      console.log('[NDI] queryParams:', qp);
      if (qp && qp['resume']) {
        console.log('[NDI] resume=1 detected -> onWalletReturn()');
        this.onWalletReturn();
      }
    });

    this.resumeIfNeeded();
  }

  ionViewWillEnter() {
    console.log('[NDI] ionViewWillEnter()');
    this.resumeIfNeeded();
  }

  ionViewDidEnter() {
    console.log('[NDI] ionViewDidEnter()');
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
    console.log('[NDI] ngOnDestroy() stopping polling');
    this.polling = false;
  }

  /* ───────────────────────── UI ACTIONS ───────────────────────── */

  openVideoGuide() {
    window.open('https://www.youtube.com/@BhutanNDI', '_blank');
  }

  async startLogin(): Promise<void> {
    console.log('[NDI] startLogin()');

    ['userCode', 'role', 'authToken', 'cidNumber'].forEach((k) =>
      localStorage.removeItem(k)
    );
    sessionStorage.clear();

    localStorage.removeItem('ndi_threadId');
    localStorage.removeItem('ndi_deeplink');

    this.denied = false;
    this.step = 'qr';

    await this.requestProof();
  }

  async openDeeplink(): Promise<void> {
    console.log('[NDI] openDeeplink() clicked');

    if (!this.deeplink) {
      console.warn('[NDI] openDeeplink() no deeplink found');
      await this.toastMessage(
        'Deeplink not ready. Please try again.',
        'danger'
      );
      return;
    }

    const threadId = localStorage.getItem('ndi_threadId');
    if (!threadId) {
      console.warn('[NDI] openDeeplink() missing threadId in storage');
      await this.toastMessage('ThreadId missing. Please try again.', 'danger');
      return;
    }

    console.log('[NDI] openDeeplink() threadId=', threadId);

    const ok = await this.prepareWebhook(threadId);
    console.log('[NDI] openDeeplink() prepareWebhook ok=', ok);

    await this.toastMessage('Opening Bhutan NDI Wallet...', 'success');

    if (this.isNative) await this.sleep(200);

    console.log(
      '[NDI] openDeeplink() launching wallet deeplink:',
      this.deeplink
    );
    window.location.href = this.deeplink;
  }

  async tryAgain(): Promise<void> {
    console.log('[NDI] tryAgain()');
    await this.startLogin();
  }

  /* ───────────────────────── RESUME / WALLET RETURN ───────────────────────── */

  private resumeIfNeeded() {
    const savedThread = localStorage.getItem('ndi_threadId');
    const savedLink = localStorage.getItem('ndi_deeplink');

    console.log('[NDI] resumeIfNeeded() savedThread=', savedThread);
    console.log('[NDI] resumeIfNeeded() savedLink=', savedLink);

    if (savedLink && !this.deeplink) this.deeplink = savedLink;
    if (savedThread) this.step = 'qr';
  }

  /** Called when wallet returns to app (ngayoe://...) */
  private async onWalletReturn(): Promise<void> {
    console.log('[NDI] onWalletReturn()');

    const threadId = localStorage.getItem('ndi_threadId');
    if (!threadId) {
      console.warn('[NDI] onWalletReturn() no threadId in storage');
      return;
    }

    this.step = 'qr';

    console.log('[NDI] onWalletReturn() ensure webhook prepared...');
    await this.prepareWebhook(threadId);

    console.log('[NDI] onWalletReturn() start polling webhook-details...');
    this.startPollingWebhookDetails(threadId);
  }

  /* ───────────────────────── PROOF REQUEST ───────────────────────── */

  private buildNdiDeepLink(base: string): string {
    if (base.toLowerCase().includes('returnurl=')) return base;
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}returnUrl=${encodeURIComponent(this.returnUrl)}`;
  }

  private async requestProof(): Promise<void> {
    this.loading = true;
    console.log('[NDI] requestProof()');

    const base = 'https://pensionapp.nppf.org.bt/ndi/proof-request';
    const url = `${base}?returnUrl=${encodeURIComponent(this.returnUrl)}`;

    try {
      console.log('[NDI] requestProof() GET:', url);

      const response = await this.getJson<ProofReply>(url);
      console.log('[NDI] requestProof() response:', response);

      if (!response?.data) throw new Error('No proof reply data');

      this.proofRequestUrl = response.data.proofRequestURL;
      this.deeplink = this.buildNdiDeepLink(response.data.deepLinkURL);

      localStorage.setItem('ndi_threadId', response.data.proofRequestThreadId);
      localStorage.setItem('ndi_deeplink', this.deeplink);

      console.log(
        '[NDI] requestProof() saved threadId:',
        response.data.proofRequestThreadId
      );
      console.log('[NDI] requestProof() saved deeplink:', this.deeplink);

      await this.prepareWebhook(response.data.proofRequestThreadId);

      await this.toastMessage('QR ready. Open Bhutan NDI Wallet.', 'success');
    } catch (e: any) {
      console.error('[NDI] ❌ requestProof failed:', e);
      await this.toastMessage('Failed to obtain proof-request', 'danger');
      this.step = 'welcome';
    } finally {
      this.loading = false;
    }
  }

  /* ───────────────────────── WEBHOOK FLOW ───────────────────────── */

  private async prepareWebhook(threadId: string): Promise<boolean> {
    try {
      console.log('[NDI] prepareWebhook() threadId=', threadId);

      const subUrl = `https://pensionapp.nppf.org.bt/ndi/webhook/subscribe`;
      const subBody = { webhookId: this.WEBHOOK_ID, threadId };
      console.log('[NDI] prepareWebhook() POST subscribe:', subUrl, subBody);
      const subResp = await this.postJson<any>(subUrl, subBody);
      console.log('[NDI] prepareWebhook() POST subscribe response:', subResp);

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

      console.log('[NDI] prepareWebhook() PUT details:', putUrl, putBody);
      const putResp = await this.putJson<any>(putUrl, putBody);
      console.log('[NDI] prepareWebhook() PUT details response:', putResp);

      return true;
    } catch (e) {
      console.error('[NDI] ❌ prepareWebhook failed:', e);
      return false;
    }
  }

  private startPollingWebhookDetails(threadId: string) {
    if (this.polling) {
      console.log('[NDI] polling already running');
      return;
    }

    this.polling = true;
    this.pollStopAt = Date.now() + 60_000;

    const tick = async () => {
      if (!this.polling) return;

      if (Date.now() > this.pollStopAt) {
        console.warn('[NDI] polling timeout reached (60s). Stop polling.');
        this.polling = false;
        await this.toastMessage(
          'Verification timeout. Please try again.',
          'danger'
        );
        return;
      }

      const done = await this.tryFetchWebhookDetails(threadId);
      if (done) {
        console.log('[NDI] polling done -> stop');
        this.polling = false;
        return;
      }

      setTimeout(tick, 2000);
    };

    tick();
  }

  private async tryFetchWebhookDetails(threadId: string): Promise<boolean> {
    try {
      const url = `https://pensionapp.nppf.org.bt/ndi/webhook-details/${encodeURIComponent(
        threadId
      )}`;
      console.log('[NDI] GET webhook-details:', url);

      const res = await this.getJson<WebhookDetailsReply>(url);
      console.log('[NDI] webhook-details response:', res);

      if (!res) return false;

      if (res.verificationResult?.toLowerCase().includes('reject')) {
        this.denied = true;
        await this.toastMessage('Access denied in wallet.', 'danger');
        return true;
      }

      if (res.verificationResult !== 'ProofValidated') {
        console.log(
          '[NDI] waiting... verificationResult=',
          res.verificationResult
        );
        return false;
      }

      const cid = this.extractCidFromRevealedAttrs(res.revealedAttrs);
      if (!cid) {
        console.warn('[NDI] ProofValidated but CID not found in revealedAttrs');
        return false;
      }

      console.log('[NDI] ✅ CID found -> validateCidFromWallet:', cid);

      // ✅ OLD LOGIN LOGIC HERE (GET -> maybe POST -> login)
      await this.validateCidFromWallet(cid);

      localStorage.removeItem('ndi_threadId');
      localStorage.removeItem('ndi_deeplink');

      return true;
    } catch (e) {
      console.error('[NDI] ❌ tryFetchWebhookDetails failed:', e);
      return false;
    }
  }

  private extractCidFromRevealedAttrs(revealedAttrs?: string): string | null {
    console.log('[NDI] extractCidFromRevealedAttrs() raw:', revealedAttrs);
    if (!revealedAttrs) return null;

    try {
      const obj = JSON.parse(revealedAttrs);
      const cid = obj?.['ID Number']?.[0]?.value;
      console.log('[NDI] extractCidFromRevealedAttrs() parsed CID=', cid);
      return cid ? String(cid).trim() : null;
    } catch (e) {
      console.error(
        '[NDI] extractCidFromRevealedAttrs() JSON parse failed:',
        e
      );
      return null;
    }
  }

  /* ───────────────────────── ✅ OLD LOGIN LOGIC (GET -> POST fallback) ───────────────────────── */

  private async validateCidFromWallet(cid: string): Promise<void> {
    if (this.loggingIn) return;
    this.loggingIn = true;

    const getUrl = `https://pensionapp.nppf.org.bt/api/pensioner/${encodeURIComponent(
      cid
    )}`;
    const postUrl = 'https://pensionapp.nppf.org.bt/api/pensioner/validate';

    try {
      console.log(this.isNative ? '🔍 [Native] GET:' : '🔍 [Web] GET:', getUrl);

      const resGet: any = await this.getJson<any>(getUrl);
      console.log('✅ GET response:', resGet);

      const statusOk = resGet?.status === true;
      const userStatus = Number(resGet?.data?.userStatus);

      // ✅ Active -> login
      if (statusOk && userStatus === 1) {
        console.log('🎉 GET valid -> login');
        this.finaliseLogin(cid);
        return;
      }

      // ⛔ Disabled -> stop (no POST)
      if (statusOk && !Number.isNaN(userStatus) && userStatus !== 1) {
        await this.toastMessage(
          'Your account is disabled, please contact NPPF admin',
          'danger'
        );
        this.step = 'welcome';
        return;
      }

      // ❗ GET not valid -> try POST fallback
      console.log('⚠️ GET returned false/invalid -> trying POST validate');
      await this.hitPostValidate(cid, postUrl);
    } catch (errGet: any) {
      console.error('🚫 GET error:', errGet);
      console.log('🔁 Trying POST fallback');
      await this.hitPostValidate(cid, postUrl);
    } finally {
      this.loggingIn = false;
    }
  }

  private async hitPostValidate(cid: string, postUrl: string): Promise<void> {
    try {
      console.log(
        this.isNative ? '📨 [Native] POST:' : '📨 [Web] POST:',
        postUrl
      );

      const resPost: any = await this.postJson<any>(postUrl, {
        cid,
        cidNumber: cid,
      });

      console.log('📨 POST response:', resPost);

      if (resPost?.status === true) {
        console.log('🎉 POST valid -> login');
        this.finaliseLogin(cid);
      } else {
        console.warn('❌ POST failed:', resPost?.message);
        await this.toastMessage(
          resPost?.message ?? 'CID validation failed.',
          'danger'
        );
        this.step = 'welcome';
      }
    } catch (errPost: any) {
      console.error('🚫 POST error:', errPost);
      const msg = errPost?.data?.message || errPost?.message || 'POST failed.';
      await this.toastMessage(
        /Unknown Error|status:\s*0/i.test(String(msg))
          ? 'Network/SSL issue. Please try again.'
          : String(msg),
        'danger'
      );
      this.step = 'welcome';
    }
  }

  private finaliseLogin(cid: string): void {
    console.log('[NDI] finaliseLogin() storing cid and navigating home');
    localStorage.setItem('cidNumber', cid);

    this.zone.run(() => {
      console.log('[NDI] router.navigate(home) now...');
      this.router.navigate(['home']).then(
        (ok) => console.log('[NDI] router.navigate result:', ok),
        (err) => console.error('[NDI] router.navigate error:', err)
      );
    });
  }

  /* ───────────────────────── ✅ TOAST (APK SAFE like Liveness) ───────────────────────── */

  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    if (!this.viewReady) {
      this.pendingToasts.push({ msg, color });
      return;
    }

    return await this.zone.run(async () => {
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
        }
      }

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
        rej(new Error(`[NDI] HARD TIMEOUT after ${ms}ms at ${label}`));
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
      console.log('[NDI][HTTP][NATIVE] GET ->', url);

      const req = (async () => {
        const res: HttpResponse = await CapacitorHttp.get({
          url,
          headers: { Accept: 'application/json' },
          connectTimeout: 20000,
          readTimeout: 20000,
        });

        console.log('[NDI][HTTP][NATIVE] GET status=', res.status);

        if (res.status && res.status >= 400) {
          console.error(
            '[NDI][HTTP][NATIVE] GET error status:',
            res.status,
            'data:',
            res.data
          );
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

    console.log('[NDI][HTTP][WEB] GET ->', url);
    return await firstValueFrom(this.http.get<T>(url).pipe(timeout(20000)));
  }

  private async postJson<T>(url: string, body: any): Promise<T> {
    if (this.isNative) {
      console.log('[NDI][HTTP][NATIVE] POST ->', url, body);

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

        console.log('[NDI][HTTP][NATIVE] POST status=', res.status);

        if (res.status && res.status >= 400) {
          console.error(
            '[NDI][HTTP][NATIVE] POST error status:',
            res.status,
            'data:',
            res.data
          );
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

    console.log('[NDI][HTTP][WEB] POST ->', url, body);
    return await firstValueFrom(
      this.http.post<T>(url, body).pipe(timeout(20000))
    );
  }

  private async putJson<T>(url: string, body: any): Promise<T> {
    if (this.isNative) {
      console.log('[NDI][HTTP][NATIVE] PUT ->', url, body);

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

        console.log('[NDI][HTTP][NATIVE] PUT status=', res.status);

        if (res.status && res.status >= 400) {
          console.error(
            '[NDI][HTTP][NATIVE] PUT error status:',
            res.status,
            'data:',
            res.data
          );
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

    console.log('[NDI][HTTP][WEB] PUT ->', url, body);
    return await firstValueFrom(
      this.http.put<T>(url, body).pipe(timeout(20000))
    );
  }
}
