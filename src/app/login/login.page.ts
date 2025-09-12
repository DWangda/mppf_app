/**************************************************************************
 * login.page.ts – prompt for CID → GET /pensioner/{cid} → POST /validate
 *                → store CID in localStorage → /home
 **************************************************************************/
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { LanguageToggleComponent } from '../shared/language-toggle.component';
import { TranslateModule } from '@ngx-translate/core';

import { of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    IonButton,
    IonContent,
    CommonModule,
    FormsModule,
    LanguageToggleComponent,
    TranslateModule,
  ],
})
export class LoginPage {
  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private http: HttpClient
  ) {}

  /** Triggered by the “Login with Bhutan NDI” button */
  onLogin() {
    this.presentCidPrompt();
  }

  /* ------------------------------------------------------------------- */
  /*                            Helpers                                  */
  /* ------------------------------------------------------------------- */

  /** Popup that asks the user for their CID number */
  private async presentCidPrompt() {
    const alert = await this.alertCtrl.create({
      header: 'Enter CID number',
      inputs: [{ name: 'cid', type: 'number', placeholder: '11410000465' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Submit',
          handler: (data) => {
            const cid = String(data.cid ?? '').trim();
            if (cid) {
              this.validateCid(cid);
              alert.dismiss();
            } else {
              this.presentToast('CID is required.');
            }
            return false;
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * 1️⃣  GET  https://202.144.158.3/nga-yoe/api/pensioner/{cid}
   * 2️⃣  If status ≠ true, POST https://202.144.158.3/nga-yoe/api/pensioner/validate
   * 3️⃣  Success → store CID → /home, otherwise show server message
   */
  private validateCid(cid: string) {
    const getUrl = `https://202.144.158.3/nga-yoe/api/pensioner/${cid}`;
    const postUrl = 'https://202.144.158.3/nga-yoe/api/pensioner/validate';

    console.log('🔍 Hitting GET:', getUrl);

    this.http.get<any>(getUrl).subscribe({
      next: (resGet) => {
        console.log('✅ GET response:', resGet);

        const statusOk = resGet?.status === true;
        const userStatus = Number(resGet?.data?.userStatus); // handles "1" or 1

        // ✅ Active user → login
        if (statusOk && userStatus === 1) {
          console.log('🎉 GET valid → login');
          localStorage.setItem('cidNumber', cid);
          this.router.navigate(['home']);
          return;
        }

        // ⛔ Disabled or non-active user → show message and STOP
        if (statusOk && !Number.isNaN(userStatus) && userStatus !== 1) {
          const msg = 'Your account is disabled, plz contact NFFP admin';
          this.presentToast(msg);
          return; // do not attempt POST
        }

        // ❗ Anything else (e.g., missing data / status false) → try POST fallback
        console.log('⚠️ GET returned false or invalid data → trying POST');
        this.hitPostValidate(cid, postUrl);
      },
      error: (errGet) => {
        console.error('🚫 GET error:', errGet);
        console.log('🔁 Trying POST fallback');
        this.hitPostValidate(cid, postUrl);
      },
    });
  }

  private hitPostValidate(cid: string, postUrl: string) {
    this.http.post<any>(postUrl, { cidNumber: cid }).subscribe({
      next: (resPost) => {
        console.log('📨 POST response:', resPost);
        if (resPost?.status === true) {
          console.log('🎉 POST valid → login');
          localStorage.setItem('cidNumber', cid);
          this.router.navigate(['home']);
        } else {
          console.warn('❌ POST failed:', resPost?.message);
          this.presentToast(resPost?.message ?? 'CID validation failed.');
        }
      },
      error: (errPost) => {
        console.error('🚫 POST error:', errPost);
        const msg =
          errPost?.error?.message || errPost?.message || 'POST failed.';
        this.presentToast(msg);
      },
    });
  }

  /** Small toast helper */
  private async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'top',
    });
    toast.present();
  }
  goToHome() {
    this.router.navigate(['home']);
  }
}
