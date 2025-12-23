import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LoadingController, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonSpinner,
  IonList,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';

import {
  wsconnect,
  nkeyAuthenticator,
  type Subscription,
  type NatsConnection,
} from '@nats-io/nats-core';

import { QRCodeComponent } from 'angularx-qrcode';
import { TranslateModule } from '@ngx-translate/core';

import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { App } from '@capacitor/app';

interface ProofReply {
  data: {
    proofRequestURL: string;
    deepLinkURL: string; // from backend (currently missing returnUrl)
    proofRequestThreadId: string;
  };
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
    IonSpinner,
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
  step: 'welcome' | 'qr' = 'welcome';
  loading = false;
  proofRequestUrl = '';
  deeplink = '';
  denied = false;

  private readonly isNative = Capacitor.isNativePlatform();

  private natsSub?: Subscription;
  private conn?: NatsConnection;

  private currentThreadId: string | null = null;
  private connecting = false;

  // ✅ MUST match your native URL scheme AND what wallet should callback with
  private readonly returnUrl = 'ngayoe://';

  constructor(
    private http: HttpClient,
    private router: Router,
    private toast: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit(): void {
    sessionStorage.clear();

    if (this.isNative) {
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          console.log('🔁 App resumed. Reconnect + resubscribe…');
          await this.ensureNatsSubscription();
        } else {
          console.log('⏸ App backgrounded. (WebSocket likely paused by OS)');
          // Don’t force close here; just reconnect on resume.
          // If you close here, you guarantee you’ll miss messages.
          this.cleanupNats(false);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.cleanupNats(true);
  }

  async startLogin(): Promise<void> {
    this.step = 'qr';
    await this.requestProof();
  }

  /** ✅ Ensure returnUrl is included in the Branch deep link */
  private buildNdiDeepLink(branchBase: string): string {
    if (!branchBase) return branchBase;

    // If already has returnUrl, keep it
    if (branchBase.toLowerCase().includes('returnurl=')) return branchBase;

    const join = branchBase.includes('?') ? '&' : '?';
    return `${branchBase}${join}returnUrl=${encodeURIComponent(
      this.returnUrl
    )}`;
  }

  private async requestProof(): Promise<void> {
    this.loading = true;
    this.denied = false;

    // You can also pass returnUrl to backend if it supports it:
    const base = 'https://pensionapp.nppf.org.bt/ndi/proof-request-liveness';
    const url = `${base}?returnUrl=${encodeURIComponent(this.returnUrl)}`;

    try {
      console.log(this.isNative ? '🔍 [Native] GET:' : '🔍 [Web] GET:', url);

      const response = await this.getJson<ProofReply>(url);
      console.log('✅ Proof-request response:', response);

      if (!response?.data) throw new Error('No proof reply data');

      this.proofRequestUrl = response.data.proofRequestURL;
      this.currentThreadId = response.data.proofRequestThreadId;

      // ✅ force returnUrl into deepLink for wallet callback
      this.deeplink = this.buildNdiDeepLink(response.data.deepLinkURL);

      // Connect and listen now (best effort)
      await this.ensureNatsSubscription();
    } catch (e: any) {
      console.error('❌ proof-request failed:', e);
      await this.toastMessage(
        e?.message?.includes('Unknown Error')
          ? 'Network/SSL issue. Please try again.'
          : 'Failed to obtain proof-request',
        'danger'
      );
      this.step = 'welcome';
    } finally {
      this.loading = false;
    }
  }

  private async ensureNatsSubscription(): Promise<void> {
    if (!this.currentThreadId) return;
    if (this.connecting) return;

    // If already connected/subscribed, do nothing
    if (this.conn && this.natsSub) return;

    this.connecting = true;

    try {
      console.log('🔌 Connecting to NATS WS…');

      const seed = new TextEncoder().encode(
        'SUAAEALJWZG6NZ2BA3SYNNBT7A3V6UPCBLZMKW43MKFOBWCLY72SMETJQM'
      );

      this.conn = await wsconnect({
        servers: 'wss://ndi.nppf.org.bt:8443',
        authenticator: nkeyAuthenticator(seed),
      });

      this.conn.closed().then((err: any) => {
        console.log('🔚 NATS closed. err=', err);
        // allow resume to reconnect
        this.cleanupNats(false);
      });

      this.natsSub = this.conn.subscribe(this.currentThreadId);
      console.log('📡 Subscribed to thread:', this.currentThreadId);

      this.startNatsLoop();
    } catch (err) {
      console.error('❌ NATS connect error:', err);
      await this.toastMessage(
        'NATS connection failed on mobile. Please try again.',
        'danger'
      );
      this.cleanupNats(false);
    } finally {
      this.connecting = false;
    }
  }

  private startNatsLoop(): void {
    if (!this.natsSub) return;

    (async () => {
      try {
        for await (const m of this.natsSub!) {
          let msg: any;
          try {
            msg = m.json<any>();
          } catch {
            msg = JSON.parse(m.string());
          }

          console.log('🧾 Parsed NATS message:', msg);

          if (msg?.data?.type === 'present-proof/rejected') {
            console.log('🚫 Proof rejected');
            this.denied = true;
            continue;
          }

          if (msg?.data?.type === 'present-proof/presentation-result') {
            const cid =
              msg.data?.requested_presentation?.revealed_attrs?.[
                'ID Number'
              ]?.[0]?.value;

            console.log('✅ Proof result CID:', cid);

            if (!cid) continue;

            await this.checkLiveliness(cid);

            // cleanup after success
            this.cleanupNats(true);
            break;
          }
        }
      } catch (e) {
        console.error('❌ Error inside NATS loop:', e);
        this.cleanupNats(false);
      }
    })().catch(console.error);
  }

  private cleanupNats(closeConn: boolean = true): void {
    try {
      this.natsSub?.unsubscribe();
    } catch {}
    this.natsSub = undefined;

    if (closeConn) {
      try {
        this.conn?.close();
      } catch {}
      this.conn = undefined;
    } else {
      this.conn = undefined;
    }
  }

  private async checkLiveliness(cid: string): Promise<void> {
    const storedCid = localStorage.getItem('cidNumber');
    const pensionId = localStorage.getItem('pensionId');

    const livelinessStatus =
      storedCid && storedCid !== cid ? 'Invalid' : 'Valid';

    let spin: HTMLIonLoadingElement | undefined;
    try {
      spin = await this.loadingCtrl.create({
        message: 'Verifying Liveliness…',
      });
      await spin.present();
    } catch {}

    const url = `https://pensionapp.nppf.org.bt/api/liveliness`;
    const payload = { pensionId, cidNumber: cid, livelinessStatus };

    try {
      const response: any = await this.postJson<any>(url, payload);

      const statusOk =
        response?.status === true ||
        response?.status === 'true' ||
        response?.status === 1;

      try {
        await spin?.dismiss();
      } catch {}

      if (statusOk && livelinessStatus === 'Valid') {
        await this.toastMessage('Liveliness verified successfully', 'success');
        this.finaliseLogin(cid);
        return;
      }

      if (livelinessStatus === 'Invalid') {
        await this.toastMessage('CID mismatched. Please try again.', 'danger');
        this.step = 'welcome';
        return;
      }

      await this.toastMessage(
        response?.message || 'Liveliness verification failed.',
        'danger'
      );
      this.step = 'welcome';
    } catch (e: any) {
      try {
        await spin?.dismiss();
      } catch {}
      await this.toastMessage(
        e?.error?.message || e?.message || 'Server error. Try again later.',
        'danger'
      );
      this.step = 'welcome';
    }
  }

  private finaliseLogin(cid: string): void {
    localStorage.setItem('cidNumber', cid);
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({ message: msg, duration: 3000, color });
    await t.present();
  }

  openDeeplink(): void {
    // Works for Branch universal links in Capacitor
    window.location.href = this.deeplink || '';
  }

  async tryAgain(): Promise<void> {
    this.denied = false;
    await this.requestProof();
  }

  openVideoGuide() {
    window.open('https://www.youtube.com/@BhutanNDI', '_blank');
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

  private async postJson<T>(url: string, body: any): Promise<T> {
    if (this.isNative) {
      const res: HttpResponse = await CapacitorHttp.post({
        url,
        data: body,
        headers: { 'Content-Type': 'application/json' },
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

    return await firstValueFrom(
      this.http.post<T>(url, body).pipe(timeout(12000))
    );
  }
}
