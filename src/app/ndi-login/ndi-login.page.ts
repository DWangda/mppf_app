import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LoadingController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonButton,
  IonSpinner,
  IonList,
} from '@ionic/angular/standalone';

import {
  wsconnect,
  nkeyAuthenticator,
  type Subscription,
} from '@nats-io/nats-core';

import { QRCodeComponent } from 'angularx-qrcode';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageToggleComponent } from '../shared/language-toggle.component';

import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

// Capacitor
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

interface ProofReply {
  data: {
    proofRequestURL: string;
    deepLinkURL: string;
    proofRequestThreadId: string;
    proofRequestName?: string;
  };
}

// ✅ Example backend response for status/result (you need this endpoint)
interface ProofResultReply {
  status: 'pending' | 'rejected' | 'done';
  cid?: string;
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

  private natsSub?: Subscription;
  private conn: any;

  private readonly isNative = Capacitor.isNativePlatform();

  // ✅ Must match your Android/iOS URL scheme
  private readonly returnUrl = 'ngayoe://';

  // Polling controls
  private polling = false;
  private pollStopAt = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit(): void {
    // If navigated with ?resume=1 (from AppComponent deep link callback)
    this.route.queryParams.subscribe((qp) => {
      if (qp && qp['resume']) {
        this.onWalletReturn();
      }
    });

    // Normal enter
    this.resumeIfNeeded();
  }

  ionViewWillEnter() {
    this.resumeIfNeeded();
  }

  ngOnDestroy(): void {
    this.stopNats();
    this.polling = false;
  }

  /* ───────────────────────── UI ACTIONS ───────────────────────── */

  openVideoGuide() {
    window.open('https://www.youtube.com/@BhutanNDI', '_blank');
  }

  async startLogin(): Promise<void> {
    ['userCode', 'role', 'authToken'].forEach((k) =>
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
    if (!this.deeplink) return;

    // On native builds, window.location.href also works for universal links
    // and avoids extra plugins (Capacitor 7 compatibility).
    window.location.href = this.deeplink;
  }

  async tryAgain(): Promise<void> {
    await this.startLogin();
  }

  /* ───────────────────────── RESUME / WALLET RETURN ───────────────────────── */

  private resumeIfNeeded() {
    const savedThread = localStorage.getItem('ndi_threadId');
    const savedLink = localStorage.getItem('ndi_deeplink');

    if (savedLink && !this.deeplink) this.deeplink = savedLink;

    // If user already started flow, show QR step again
    if (savedThread) this.step = 'qr';
  }

  /** Called when wallet returns to app (ngayoe://...) */
  private async onWalletReturn(): Promise<void> {
    const threadId = localStorage.getItem('ndi_threadId');
    if (!threadId) return;

    this.step = 'qr';

    // ✅ FIRST: try backend result (because NATS message may be missed)
    const done = await this.tryFetchProofResult(threadId);
    if (done) return;

    // ✅ SECOND: start polling for some seconds (best UX)
    this.startPollingProofResult(threadId);

    // ✅ OPTIONAL: also reconnect NATS while foreground (bonus real-time)
    if (!this.natsSub && !this.loading) {
      this.listenOnNats(threadId);
    }
  }

  /* ───────────────────────── PROOF REQUEST ───────────────────────── */

  private buildNdiDeepLink(base: string): string {
    // Ensure returnUrl exists in final deep link
    // If base already has returnUrl, don’t duplicate it.
    if (base.toLowerCase().includes('returnurl=')) return base;

    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}returnUrl=${encodeURIComponent(this.returnUrl)}`;
  }

  private async requestProof(): Promise<void> {
    this.loading = true;

    // Your API call
    const base = 'https://pensionapp.nppf.org.bt/ndi/proof-request';

    // If your backend supports returnUrl, keep this.
    // Even if backend ignores it, we still append returnUrl ourselves below.
    const url = `${base}?returnUrl=${encodeURIComponent(this.returnUrl)}`;

    try {
      const response = await this.getJson<ProofReply>(url);
      if (!response?.data) throw new Error('No proof reply data');

      this.proofRequestUrl = response.data.proofRequestURL;

      // ✅ IMPORTANT: ensure deepLink has returnUrl
      this.deeplink = this.buildNdiDeepLink(response.data.deepLinkURL);

      localStorage.setItem('ndi_threadId', response.data.proofRequestThreadId);
      localStorage.setItem('ndi_deeplink', this.deeplink);

      // Listen while foreground (works in browser; may work in native until background)
      this.listenOnNats(response.data.proofRequestThreadId);
    } catch (e: any) {
      console.error('❌ proof-request failed:', e);
      await this.toastMessage('Failed to obtain proof-request', 'danger');
      this.step = 'welcome';
    } finally {
      this.loading = false;
    }
  }

  /* ───────────────────────── BACKEND RESULT (REQUIRED FOR NATIVE RELIABILITY) ───────────────────────── */

  private async tryFetchProofResult(threadId: string): Promise<boolean> {
    try {
      // ✅ You need this endpoint (replace with your real one)
      const url = `https://pensionapp.nppf.org.bt/ndi/proof-result?threadId=${encodeURIComponent(
        threadId
      )}`;

      const res = await this.getJson<ProofResultReply>(url);

      if (res?.status === 'rejected') {
        this.denied = true;
        return true;
      }

      if (res?.status === 'done' && res?.cid) {
        await this.checkPensionerApis(res.cid);

        await this.stopNats();
        localStorage.removeItem('ndi_threadId');
        localStorage.removeItem('ndi_deeplink');

        return true;
      }

      return false; // pending
    } catch (e) {
      // If endpoint not ready / not found, you’ll see it here
      console.warn('⚠️ proof-result endpoint not available yet:', e);
      return false;
    }
  }

  private startPollingProofResult(threadId: string) {
    if (this.polling) return;

    this.polling = true;
    this.pollStopAt = Date.now() + 45_000; // 45 seconds

    const tick = async () => {
      if (!this.polling) return;
      if (Date.now() > this.pollStopAt) {
        this.polling = false;
        return;
      }

      const done = await this.tryFetchProofResult(threadId);
      if (done) {
        this.polling = false;
        return;
      }

      setTimeout(tick, 2000);
    };

    tick();
  }

  /* ───────────────────────── NATS LISTENER (BEST EFFORT) ───────────────────────── */

  private async listenOnNats(threadId: string): Promise<void> {
    if (this.natsSub) return;

    const seed = new TextEncoder().encode(
      'SUAAEALJWZG6NZ2BA3SYNNBT7A3V6UPCBLZMKW43MKFOBWCLY72SMETJQM'
    );

    try {
      this.conn = await wsconnect({
        servers: 'wss://ndi.nppf.org.bt:8443',
        authenticator: nkeyAuthenticator(seed),
      });
    } catch (err) {
      console.error('❌ NATS connect error:', err);
      return;
    }

    this.natsSub = this.conn.subscribe(threadId);

    (async () => {
      try {
        for await (const m of this.natsSub!) {
          let msg: any;
          try {
            msg = m.json<any>();
          } catch {
            msg = JSON.parse(m.string());
          }

          if (msg?.data?.type === 'present-proof/rejected') {
            this.denied = true;
            continue;
          }

          if (msg?.data?.type === 'present-proof/presentation-result') {
            const cid =
              msg.data.requested_presentation.revealed_attrs['ID Number'][0]
                ?.value;

            if (cid) {
              await this.checkPensionerApis(cid);

              await this.stopNats();
              localStorage.removeItem('ndi_threadId');
              localStorage.removeItem('ndi_deeplink');
              break;
            }
          }
        }
      } catch (err) {
        console.error('❌ Error in NATS subscription loop:', err);
      }
    })().catch(console.error);
  }

  private async stopNats() {
    try {
      this.natsSub?.unsubscribe();
    } catch {}
    this.natsSub = undefined;

    try {
      await this.conn?.close();
    } catch {}
    this.conn = undefined;
  }

  /* ───────────────────────── PENSIONER CHECK ───────────────────────── */

  private async checkPensionerApis(cid: string): Promise<void> {
    const getUrl = `https://pensionapp.nppf.org.bt/api/pensioner/${cid}`;

    let spin: HTMLIonLoadingElement | undefined;
    try {
      spin = await this.loadingCtrl.create({ message: 'Verifying…' });
      await spin.present();
    } catch {}

    try {
      const getResp: any = await this.getJson<any>(getUrl);

      const statusOk =
        getResp?.status === true ||
        getResp?.status === 'true' ||
        getResp?.status === 1;

      const userStatus = Number(getResp?.data?.userStatus);

      try {
        await spin?.dismiss();
      } catch {}

      if (statusOk && userStatus === 1) {
        this.finaliseLogin(cid);
        return;
      }

      await this.toastMessage(
        'Your User Account has been disabled, Please contact NPPF admin for further assistance.',
        'danger'
      );
      this.step = 'welcome';
    } catch (e) {
      try {
        await spin?.dismiss();
      } catch {}
      await this.toastMessage('Unable to verify pensioner.', 'danger');
      this.step = 'welcome';
    }
  }

  private finaliseLogin(cid: string): void {
    localStorage.setItem('cidNumber', cid);
    this.router.navigate(['home']);
  }

  /* ───────────────────────── HELPERS ───────────────────────── */

  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({
      message: msg,
      duration: 3000,
      color,
      position: 'top',
    });
    t.present();
  }

  private async getJson<T>(url: string): Promise<T> {
    if (this.isNative) {
      const res: HttpResponse = await CapacitorHttp.get({
        url,
        connectTimeout: 15000,
        readTimeout: 15000,
      });

      let data: any = res.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {}
      }
      return (data ?? {}) as T;
    }

    return await firstValueFrom(this.http.get<T>(url).pipe(timeout(12000)));
  }
}
