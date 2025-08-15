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
  IonButtons,
  IonBackButton,
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
  selector: 'app-liveness',
  templateUrl: './liveness.page.html',
  styleUrls: ['./liveness.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    /* Ionic standalone building‑blocks */
    // IonIcon,
    // IonItem,
    // IonLabel,
    IonList,
    IonSpinner,
    IonButton,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,

    /* Angular basics */
    CommonModule,
    FormsModule,
    /* QR code (standalone declarable) */
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
    const url = 'http://localhost:3000/ndiapi/api/proof-request-liveness';

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
  //         await this.checkLiveliness(cid);
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
          await this.checkLiveliness(cid);
          this.natsSub?.unsubscribe();
          conn.close();
          break;
        }
      }
    })().catch(console.error);
  }
  private async checkLiveliness(cid: string): Promise<void> {
    const storedCid = localStorage.getItem('cidNumber');
    const pensionId = localStorage.getItem('pensionId');

    // Validate if CID matches
    if (storedCid && storedCid !== cid) {
      this.toastMessage('CID mismatch. Please try again.', 'danger');
      this.step = 'welcome';
      return;
    }

    const spin = await this.loadingCtrl.create({
      message: 'Verifying Liveliness…',
    });
    await spin.present();

    const url = `http://localhost:8080/api/liveliness`;
    const payload = {
      pensionId: pensionId,
      cidNumber: cid,
      livelinessStatus: 'Valid',
    };

    try {
      const response: any = await this.http.post(url, payload).toPromise();
      await spin.dismiss();

      if (response?.status === true) {
        this.toastMessage('Liveliness verified successfully', 'success');
        this.finaliseLogin(cid);
        //       this.router.navigate(['/dashboard'], {
        //   replaceUrl: true,
        //   state: { refresh: true, ts: Date.now() }, // ts busts any caching
        // });
      } else {
        this.toastMessage(
          response?.message || 'Liveliness verification failed.',
          'danger'
        );
        this.step = 'welcome';
      }
    } catch (e: any) {
      await spin.dismiss();
      const errorMsg =
        e?.error?.message || e?.message || 'Server error. Try again later.';
      this.toastMessage(errorMsg, 'danger');
      this.step = 'welcome';
    }
  }
  // private async checkLiveliness(cid: string): Promise<void> {
  //   const storedCid = localStorage.getItem('cidNumber');
  //   const pensionId = localStorage.getItem('pensionId'); // Ensure pensionId is saved earlier

  //   // Validate if CID matches
  //   if (storedCid && storedCid !== cid) {
  //     this.toastMessage('CID mismatch. Please try again.', 'danger');
  //     this.step = 'welcome';
  //     return;
  //   }

  //   // Proceed if valid
  //   const spin = await this.loadingCtrl.create({
  //     message: 'Verifying Liveliness…',
  //   });
  //   await spin.present();

  //   const url = `http://localhost:8080/api/liveliness`;
  //   const payload = {
  //     pensionId: pensionId,
  //     cidNumber: cid,
  //     livelinessStatus: 'Valid',
  //   };

  //   try {
  //     const response: any = await this.http.post(url, payload).toPromise();
  //     await spin.dismiss();

  //     if (response?.status === true) {
  //       this.toastMessage('Liveliness verified successfully', 'success');
  //       this.finaliseLogin(cid); // Navigate to home after success
  //     } else {
  //       this.toastMessage('Liveliness verification failed.', 'danger');
  //       this.step = 'welcome';
  //     }
  //   } catch (e) {
  //     await spin.dismiss();
  //     this.toastMessage('Server error. Try again later.', 'danger');
  //     this.step = 'welcome';
  //   }
  // }

  /*──────────────────────────────────────────────────────────*/
  /*                    SUCCESS → DASHBOARD                   */
  /*──────────────────────────────────────────────────────────*/
  private finaliseLogin(cid: string): void {
    localStorage.setItem('cidNumber', cid);
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
