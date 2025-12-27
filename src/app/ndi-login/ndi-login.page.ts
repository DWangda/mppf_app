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

// Capacitor HTTP
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';

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

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    console.log('[NDI] ngOnInit()');

    // If navigated with ?resume=1 (from AppComponent deep link callback)
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
    console.log(
      '[NDI] openDeeplink() preparing webhook subscribe + details...'
    );

    const ok = await this.prepareWebhook(threadId);
    console.log('[NDI] openDeeplink() prepareWebhook ok=', ok);

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

    // Ensure webhook is subscribed (safe to call again)
    console.log('[NDI] onWalletReturn() ensure webhook prepared...');
    await this.prepareWebhook(threadId);

    // Poll webhook-details until proof validated
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

      // Prepare webhook immediately (so phone is ready before wallet opens)
      await this.prepareWebhook(response.data.proofRequestThreadId);
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

      // 1) Subscribe
      const subUrl = `https://pensionapp.nppf.org.bt/ndi/webhook/subscribe`;
      const subBody = {
        webhookId: this.WEBHOOK_ID,
        threadId: threadId,
      };

      console.log('[NDI] prepareWebhook() POST subscribe:', subUrl, subBody);
      const subResp = await this.postJson<any>(subUrl, subBody);
      console.log('[NDI] prepareWebhook() POST subscribe response:', subResp);

      // 2) Update webhook details (PUT)
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
    this.pollStopAt = Date.now() + 60_000; // 60 seconds
    console.log(
      '[NDI] startPollingWebhookDetails() for 60s threadId=',
      threadId
    );

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

      // If rejected (optional if your backend indicates)
      if (
        res.verificationResult &&
        res.verificationResult.toLowerCase().includes('reject')
      ) {
        console.warn(
          '[NDI] ❌ verificationResult rejected:',
          res.verificationResult
        );
        this.denied = true;
        return true;
      }

      if (res.verificationResult !== 'ProofValidated') {
        console.log(
          '[NDI] waiting... verificationResult=',
          res.verificationResult
        );
        return false;
      }

      // Extract CID from revealedAttrs string
      const cid = this.extractCidFromRevealedAttrs(res.revealedAttrs);
      if (!cid) {
        console.warn('[NDI] ProofValidated but CID not found in revealedAttrs');
        return false;
      }

      console.log('[NDI] ✅ CID found -> checkPensionerApis:', cid);

      // Verify pensioner and login
      await this.checkPensionerApis(cid);

      // cleanup after success path
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
      // revealedAttrs is itself a JSON string
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

  /* ───────────────────────── PENSIONER CHECK ───────────────────────── */

  private async checkPensionerApis(cid: string): Promise<void> {
    const getUrl = `https://pensionapp.nppf.org.bt/api/pensioner/${encodeURIComponent(
      cid
    )}`;
    console.log('[NDI] checkPensionerApis() cid:', cid);
    console.log('[NDI] checkPensionerApis() GET:', getUrl);

    try {
      console.log('[NDI] checkPensionerApis() -> calling getJson...');
      const getResp: any = await this.getJson<any>(getUrl);
      console.log('[NDI] checkPensionerApis() <- response:', getResp);

      const statusOk =
        getResp?.status === true ||
        getResp?.status === 'true' ||
        getResp?.status === 1;

      const userStatus = Number(getResp?.data?.userStatus);

      console.log(
        '[NDI] checkPensionerApis() statusOk=',
        statusOk,
        'userStatus=',
        userStatus
      );

      if (statusOk && userStatus === 1) {
        console.log('[NDI] ✅ Pensioner verified -> finaliseLogin()');
        this.finaliseLogin(cid);
        return;
      }

      console.warn('[NDI] ❌ User disabled or invalid');
      await this.toastMessage(
        'Your User Account has been disabled, Please contact NPPF admin for further assistance.',
        'danger'
      );
      this.step = 'welcome';
    } catch (e: any) {
      console.error('[NDI] ❌ checkPensionerApis failed:', e);

      const msg =
        e?.message ||
        e?.error ||
        (typeof e === 'string'
          ? e
          : 'Unable to verify pensioner (network error).');

      await this.toastMessage(String(msg), 'danger');
      this.step = 'welcome';
    }
  }

  private finaliseLogin(cid: string): void {
    console.log('[NDI] finaliseLogin() storing cid and navigating home');

    localStorage.setItem('cidNumber', cid);

    // IMPORTANT: ensure navigation happens inside Angular zone (fixes “not navigating” on device)
    this.zone.run(() => {
      console.log('[NDI] router.navigate(home) now...');
      this.router.navigate(['home']).then(
        (ok) => console.log('[NDI] router.navigate result:', ok),
        (err) => console.error('[NDI] router.navigate error:', err)
      );
    });
  }

  /* ───────────────────────── TOAST ───────────────────────── */

  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({
      message: msg,
      duration: 3500,
      color,
      position: 'top',
    });
    t.present();
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

        // If backend returns non-2xx, treat as error (so you can see it)
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
          } catch {
            // keep as string
          }
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
