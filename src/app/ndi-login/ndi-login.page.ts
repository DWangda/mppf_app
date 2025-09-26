import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LoadingController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
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

// ✅ Official Capacitor HTTP (stable)
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';

interface ProofReply {
  data: {
    proofRequestURL: string;
    deepLinkURL: string;
    proofRequestThreadId: string;
  };
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
  private readonly isNative = Capacitor.isNativePlatform();

  constructor(
    private http: HttpClient,
    private router: Router,
    private toast: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  /*──────────────────────────────────────────────────────────*/
  /*                      LIFE-CYCLE                          */
  /*──────────────────────────────────────────────────────────*/
  ngOnInit(): void {
    ['userCode', 'role', 'authToken'].forEach((k) =>
      localStorage.removeItem(k)
    );
    sessionStorage.clear();
    history.pushState(null, '', location.href);
  }

  ngOnDestroy(): void {
    this.natsSub?.unsubscribe();
  }

  /*──────────────────────────────────────────────────────────*/
  /*                  MAIN ENTRY BUTTON                       */
  /*──────────────────────────────────────────────────────────*/
  async startLogin(): Promise<void> {
    this.step = 'qr';
    await this.requestProof('login');
  }

  /*──────────────────────────────────────────────────────────*/
  /*                NDI  →  PROOF REQUEST                     */
  /*──────────────────────────────────────────────────────────*/
  private async requestProof(_type: 'login'): Promise<void> {
    this.loading = true;
    const url = 'https://pensionapp.nppf.org.bt/ndi/proof-request';
    try {
      console.log(this.isNative ? '🔍 [Native] GET:' : '🔍 [Web] GET:', url);

      const response = await this.getJson<ProofReply>(url);
      if (!response?.data) throw new Error('No proof reply data');

      this.proofRequestUrl = response.data.proofRequestURL;
      this.deeplink = response.data.deepLinkURL;

      await this.listenOnNats(response.data.proofRequestThreadId);
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

  /*──────────────────────────────────────────────────────────*/
  /*                NATS  →  LISTENER                         */
  /*──────────────────────────────────────────────────────────*/
  private async listenOnNats(threadId: string): Promise<void> {
    const seed = new TextEncoder().encode(
      'SUAPXY7TJFUFE3IX3OEMSLE3JFZJ3FZZRSRSOGSG2ANDIFN77O2MIBHWUM'
    );

    const conn = await wsconnect({
      servers: 'wss://natsdemoclient.bhutanndi.com',
      authenticator: nkeyAuthenticator(seed),
    });

    this.natsSub = conn.subscribe(threadId);

    (async () => {
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
              .value;
          await this.checkPensionerApis(cid);
          this.natsSub?.unsubscribe();
          conn.close();
          break;
        }
      }
    })().catch(console.error);
  }

  /*──────────────────────────────────────────────────────────*/
  /*             2-STEP  PENSIONER API CHECK                  */
  /*──────────────────────────────────────────────────────────*/
  private async checkPensionerApis(cid: string): Promise<void> {
    const spin = await this.loadingCtrl.create({ message: 'Verifying…' });
    await spin.present();

    const getUrl = `https://pensionapp.nppf.org.bt/api/pensioner/${cid}`;
    const postUrl = `https://pensionapp.nppf.org.bt/api/pensioner/validate`;

    try {
      console.log(this.isNative ? '🔍 [Native] GET:' : '🔍 [Web] GET:', getUrl);
      const getResp: any = await this.getJson<any>(getUrl);
      console.log('✅ GET response:', getResp);

      const statusOk = getResp?.status === true;
      const userStatus = Number(getResp?.data?.userStatus);

      if (getResp?.data) {
        const ps = String(
          getResp.data.pensionStatus ??
            getResp.data.pentionStatus ??
            (Number.isFinite(userStatus) && userStatus !== 1 ? '03' : '')
        ).trim();
        if (ps) localStorage.setItem('pensionStatus', ps);
        if (Number.isFinite(userStatus)) {
          localStorage.setItem('userStatus', String(userStatus));
        }
      }

      // ✅ Active → login
      if (statusOk && userStatus === 1) {
        await spin.dismiss();
        this.finaliseLogin(cid);
        return;
      }

      // ⛔ Disabled/non-active → message and STOP
      if (statusOk && Number.isFinite(userStatus) && userStatus !== 1) {
        await spin.dismiss();
        await this.toastMessage(
          'Your User Account has been disabled, Please contact NPPF admin for further assistance.',
          'danger'
        );
        this.step = 'welcome';
        return;
      }

      // ❗ Unknown/malformed → try POST
      console.warn('⚠️ GET not valid, falling back to POST…');
      await this.fallbackToPost(cid, postUrl, spin);
    } catch (getError) {
      console.error('GET failed, falling back to POST:', getError);
      await this.fallbackToPost(cid, postUrl, spin);
    }
  }

  private async fallbackToPost(
    cid: string,
    postUrl: string,
    spin: HTMLIonLoadingElement
  ): Promise<void> {
    try {
      console.log(
        this.isNative ? '📨 [Native] POST:' : '📨 [Web] POST:',
        postUrl
      );
      const postResp: any = await this.postJson<any>(postUrl, {
        cid,
        cidNumber: cid,
      });
      console.log('📨 POST response:', postResp);

      const statusOk = postResp?.status === true;
      const userStatus = Number(postResp?.data?.userStatus);

      if (postResp?.data) {
        const ps = String(
          postResp.data.pensionStatus ??
            postResp.data.pentionStatus ??
            (Number.isFinite(userStatus) && userStatus !== 1 ? '03' : '')
        ).trim();
        if (ps) localStorage.setItem('pensionStatus', ps);
        if (Number.isFinite(userStatus)) {
          localStorage.setItem('userStatus', String(userStatus));
        }
      }

      if (statusOk && userStatus === 1) {
        await spin.dismiss();
        this.finaliseLogin(cid);
        return;
      }

      if (statusOk && Number.isFinite(userStatus) && userStatus !== 1) {
        await spin.dismiss();
        await this.toastMessage(
          'Your User Account has been disabled, Please contact NPPF admin for further assistance.',
          'danger'
        );
        this.step = 'welcome';
        return;
      }

      await spin.dismiss();
      await this.toastMessage(
        postResp?.message ?? 'CID validation failed.',
        'danger'
      );
      this.step = 'welcome';
    } catch (postError: any) {
      console.error('🚫 POST error:', postError);
      await spin.dismiss();
      await this.toastMessage(
        postError?.message?.includes('Unknown Error')
          ? 'Network/SSL issue. Please try again.'
          : 'Unable to verify pensioner.',
        'danger'
      );
      this.step = 'welcome';
    }
  }

  /*──────────────────────────────────────────────────────────*/
  /*                    SUCCESS → DASHBOARD                   */
  /*──────────────────────────────────────────────────────────*/
  private finaliseLogin(cid: string): void {
    localStorage.setItem('cidNumber', cid);
    this.router.navigate(['home']);
  }

  /*──────────────────────────────────────────────────────────*/
  /*                        HELPERS                           */
  /*──────────────────────────────────────────────────────────*/
  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({
      message: msg,
      duration: 3000,
      color,
      position: 'top',
    });
    t.present();
  }

  openDeeplink(): void {
    // Prefer in-place navigation to trigger the native app
    try {
      window.location.href = this.deeplink || '';
    } catch {
      window.open(this.deeplink || '', '_self');
    }
  }

  async tryAgain(): Promise<void> {
    this.denied = false;
    await this.requestProof('login');
  }

  openVideoGuide() {
    window.open('https://www.youtube.com/@BhutanNDI', '_blank');
  }

  /* --------------------------- HTTP helpers --------------------------- */
  // Use CapacitorHttp on device (no browser CORS), HttpClient on web.
  private async getJson<T>(url: string): Promise<T> {
    if (this.isNative) {
      const res: HttpResponse = await CapacitorHttp.get({
        url,
        connectTimeout: 15000,
        readTimeout: 15000,
      });
      const ct =
        res.headers?.['content-type'] || res.headers?.['Content-Type'] || '';
      const data =
        typeof res.data === 'string' && ct.includes('application/json')
          ? JSON.parse(res.data as string)
          : res.data;
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
      const ct =
        res.headers?.['content-type'] || res.headers?.['Content-Type'] || '';
      const data =
        typeof res.data === 'string' && ct.includes('application/json')
          ? JSON.parse(res.data as string)
          : res.data;
      return (data ?? {}) as T;
    }
    return await firstValueFrom(
      this.http.post<T>(url, body).pipe(timeout(12000))
    );
  }
}
