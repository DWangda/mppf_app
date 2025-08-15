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
  IonLabel,
  IonItem,
  IonIcon,
} from '@ionic/angular/standalone';

// import { connect, nkeyAuthenticator, StringCodec, Subscription } from 'nats.ws';
import {
  wsconnect,
  nkeyAuthenticator,
  type Subscription,
} from '@nats-io/nats-core';
import { QRCodeComponent } from 'angularx-qrcode'; // ✅ angularx‑qrcode standalone
import { TranslateModule } from '@ngx-translate/core';
import { LanguageToggleComponent } from '../shared/language-toggle.component';

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
    /* Ionic standalone building‑blocks */
    // IonIcon,
    // IonItem,
    // IonLabel,
    IonList,
    IonSpinner,
    IonButton,
    IonContent,

    /* Angular basics */
    CommonModule,
    FormsModule,
    /* QR code (standalone declarable) */
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

  /** ───────── NATS ───────── */
  private natsSub?: Subscription;

  constructor(
    private http: HttpClient,
    private router: Router,
    private toast: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  /*──────────────────────────────────────────────────────────*/
  /*                      LIFE‑CYCLE                          */
  /*──────────────────────────────────────────────────────────*/
  ngOnInit(): void {
    /* Clean local/session storage every time this page loads */
    ['userCode', 'role', 'authToken'].forEach((k) =>
      localStorage.removeItem(k)
    );
    sessionStorage.clear();
    history.pushState(null, '', location.href); // block browser Back
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
  /*                NDI  →  PROOF REQUEST                     */
  /*──────────────────────────────────────────────────────────*/
  private async requestProof(type: 'login'): Promise<void> {
    this.loading = true;

    // const url = 'http://172.30.78.167:3000/ndiapi/api/proof-request';
    const url = 'http://localhost:3000/ndiapi/api/proof-request';

    try {
      const response = await this.http.get<ProofReply>(url).toPromise();
      if (!response || !response.data) {
        throw new Error('No proof reply data');
      }
      this.proofRequestUrl = response.data.proofRequestURL;
      this.deeplink = response.data.deepLinkURL;

      await this.listenOnNats(response.data.proofRequestThreadId);
    } catch (e) {
      this.toastMessage('Failed to obtain proof‑request', 'danger');
      this.step = 'welcome';
    } finally {
      this.loading = false;
    }
  }

  /*──────────────────────────────────────────────────────────*/
  /*                NATS  →  LISTENER                         */
  /*──────────────────────────────────────────────────────────*/
  // private async listenOnNats(threadId: string): Promise<void> {
  //   const seed = new TextEncoder().encode(
  //     'SUAPXY7TJFUFE3IX3OEMSLE3JFZJ3FZZRSRSOGSG2ANDIFN77O2MIBHWUM' // staging
  //   );

  //   const conn = await connect({
  //     servers: ['https://natsdemoclient.bhutanndi.com'],
  //     authenticator: nkeyAuthenticator(seed),
  //   });

  //   const sc = StringCodec();
  //   this.natsSub = conn.subscribe(threadId);

  //   (async () => {
  //     for await (const m of this.natsSub!) {
  //       const msg = JSON.parse(sc.decode(m.data));

  //       /* user cancelled */
  //       if (msg.data?.type === 'present-proof/rejected') {
  //         this.denied = true;
  //         continue;
  //       }

  //       /* proof presented & verified */
  //       if (msg.data?.type === 'present-proof/presentation-result') {
  //         console.log('Proof presented:', msg.data);
  //         const cid =
  //           msg.data.requested_presentation.revealed_attrs['ID Number'][0]
  //             .value;
  //         await this.checkPensionerApis(cid);
  //         this.natsSub?.unsubscribe();
  //         conn.close();
  //         break;
  //       }
  //     }
  //   })().catch(console.error);
  // }

  private async listenOnNats(threadId: string): Promise<void> {
    const seed = new TextEncoder().encode(
      'SUAPXY7TJFUFE3IX3OEMSLE3JFZJ3FZZRSRSOGSG2ANDIFN77O2MIBHWUM'
    );

    const conn = await wsconnect({
      servers: 'wss://natsdemoclient.bhutanndi.com', // WebSocket URL
      authenticator: nkeyAuthenticator(seed),
    });

    this.natsSub = conn.subscribe(threadId);

    (async () => {
      for await (const m of this.natsSub!) {
        // v3: decode without StringCodec
        let msg: any;
        try {
          msg = m.json<any>(); // parses JSON payloads
        } catch {
          msg = JSON.parse(m.string()); // fallback if needed
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
  /*             2‑STEP  PENSIONER API CHECK                  */
  /*──────────────────────────────────────────────────────────*/
  // private async checkPensionerApis(cid: string): Promise<void> {
  //   const spin = await this.loadingCtrl.create({ message: 'Verifying…' });
  //   await spin.present();

  //   const getUrl = `http://localhost:8080/api/pensioner/${cid}`;
  //   const postUrl = `http://localhost:8080/api/pensioner/validate`;

  //   try {
  //     console.log('🔍 Attempting GET:', getUrl);
  //     const getResp: any = await this.http.get(getUrl).toPromise();
  //     console.log('✅ GET response:', getResp);

  //     const isValidGet =
  //       getResp?.status === true &&
  //       getResp?.data !== null &&
  //       getResp?.data?.userStatus === 1;

  //     if (isValidGet) {
  //       console.log('🎉 GET is valid → login');
  //       await spin.dismiss();
  //       this.finaliseLogin(cid);
  //       return;
  //     }

  //     // ❌ GET invalid, fallback to POST
  //     console.warn('⚠️ GET not valid, falling back to POST...');
  //     await this.fallbackToPost(cid, postUrl, spin);
  //   } catch (getError) {
  //     console.error('🚫 GET failed, falling back to POST:', getError);
  //     await this.fallbackToPost(cid, postUrl, spin);
  //   }
  // }

  // private async fallbackToPost(
  //   cid: string,
  //   postUrl: string,
  //   spin: HTMLIonLoadingElement
  // ): Promise<void> {
  //   try {
  //     console.log('📨 Attempting POST:', postUrl);
  //     const postResp: any = await this.http
  //       .post(postUrl, { cidNumber: cid })
  //       .toPromise();
  //     console.log('📨 POST response:', postResp);

  //     if (postResp?.status === true) {
  //       console.log('🎉 POST is valid → login');
  //       await spin.dismiss();
  //       this.finaliseLogin(cid);
  //     } else {
  //       console.warn('❌ POST failed:', postResp?.message);
  //       await spin.dismiss();
  //       this.toastMessage(
  //         postResp?.message ?? 'CID validation failed.',
  //         'danger'
  //       );
  //       this.step = 'welcome';
  //     }
  //   } catch (postError) {
  //     console.error('🚫 POST error:', postError);
  //     await spin.dismiss();
  //     this.toastMessage('Unable to verify pensioner.', 'danger');
  //     this.step = 'welcome';
  //   }
  // }
  private async checkPensionerApis(cid: string): Promise<void> {
    const spin = await this.loadingCtrl.create({ message: 'Verifying…' });
    await spin.present();

    const getUrl = `http://localhost:8080/api/pensioner/${cid}`;
    const postUrl = `http://localhost:8080/api/pensioner/validate`;

    try {
      console.log('🔍 Attempting GET:', getUrl);
      const getResp: any = await this.http.get(getUrl).toPromise();
      console.log('✅ GET response:', getResp);

      const statusOk = getResp?.status === true;
      const userStatus = Number(getResp?.data?.userStatus);

      // store status hints for later screens (e.g., liveness)
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
        console.log('🎉 GET is valid → login');
        await spin.dismiss();
        this.finaliseLogin(cid);
        return;
      }

      // ⛔ Disabled/non-active → message and STOP (no POST fallback)
      if (statusOk && Number.isFinite(userStatus) && userStatus !== 1) {
        await spin.dismiss();
        await this.toastMessage(
          'Your User Account has been disabled, Please contact NFFP admin for further assistance.',
          'danger'
        );
        this.step = 'welcome';
        return;
      }

      // ❗ Unknown/malformed → try POST
      console.warn('⚠️ GET not valid, falling back to POST…');
      await this.fallbackToPost(cid, postUrl, spin);
    } catch (getError) {
      console.error('🚫 GET failed, falling back to POST:', getError);
      await this.fallbackToPost(cid, postUrl, spin);
    }
  }

  private async fallbackToPost(
    cid: string,
    postUrl: string,
    spin: HTMLIonLoadingElement
  ): Promise<void> {
    try {
      console.log('📨 Attempting POST:', postUrl);
      const postResp: any = await this.http
        .post(postUrl, { cidNumber: cid })
        .toPromise();
      console.log('📨 POST response:', postResp);

      const statusOk = postResp?.status === true;
      const userStatus = Number(postResp?.data?.userStatus);

      // store status hints if provided
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

      // ✅ Active → login
      if (statusOk && userStatus === 1) {
        await spin.dismiss();
        console.log('🎉 POST valid → login');
        this.finaliseLogin(cid);
        return;
      }

      // ⛔ Disabled/non-active → message and STOP
      if (statusOk && Number.isFinite(userStatus) && userStatus !== 1) {
        await spin.dismiss();
        await this.toastMessage(
          'Your User Account has been disabled, Please contact NFFP admin for further assistance.',
          'danger'
        );
        this.step = 'welcome';
        return;
      }

      // ❌ POST said not ok
      await spin.dismiss();
      await this.toastMessage(
        postResp?.message ?? 'CID validation failed.',
        'danger'
      );
      this.step = 'welcome';
    } catch (postError) {
      console.error('🚫 POST error:', postError);
      await spin.dismiss();
      this.toastMessage('Unable to verify pensioner.', 'danger');
      this.step = 'welcome';
    }
  }

  /*──────────────────────────────────────────────────────────*/
  /*                    SUCCESS → DASHBOARD                   */
  /*──────────────────────────────────────────────────────────*/
  private finaliseLogin(cid: string): void {
    localStorage.setItem('cidNumber', cid);
    // localStorage.setPensionStatus("pentionStatus", pensionStatus)
    // …fetch privileges here if required
    this.router.navigate(['home']);
  }

  /*──────────────────────────────────────────────────────────*/
  /*                        HELPERS                           */
  /*──────────────────────────────────────────────────────────*/
  async toastMessage(msg: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toast.create({ message: msg, duration: 3000, color });
    t.present();
  }

  /* open Bhutan NDI Wallet on mobile */
  openDeeplink(): void {
    window.open(this.deeplink, '_self');
  }

  /* re‑generate QR after “Access Denied” */
  async tryAgain(): Promise<void> {
    this.denied = false;
    await this.requestProof('login');
  }
  openVideoGuide() {
    const videoUrl = 'https://www.youtube.com/@BhutanNDI'; // Replace with actual video URL
    window.open(videoUrl, '_blank');
  }
}
