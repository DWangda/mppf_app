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

import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

// ✅ Official Capacitor HTTP (stable) to bypass web CORS in APK
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';

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
  private readonly isNative = Capacitor.isNativePlatform();
  private loggingIn = false;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private http: HttpClient
  ) {}

  /** Triggered by the “Login with Bhutan NDI” button */
  onLogin() {
    if (this.loggingIn) return;
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
   * 1️⃣  GET  https://pensionapp.nppf.org.bt/api/pensioner/{cid}
   * 2️⃣  If status ≠ true, POST https://pensionapp.nppf.org.bt/api/pensioner/validate
   * 3️⃣  Success → store CID → /home, otherwise show server message
   */
  private async validateCid(cid: string) {
    if (this.loggingIn) return;
    this.loggingIn = true;

    const getUrl = `https://pensionapp.nppf.org.bt/api/pensioner/${cid}`;
    const postUrl = 'https://pensionapp.nppf.org.bt/api/pensioner/validate';

    try {
      console.log(this.isNative ? '🔍 [Native] GET:' : '🔍 [Web] GET:', getUrl);

      const resGet: any = await this.getJson<any>(getUrl);
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
        const msg = 'Your account is disabled, please contact NPPF admin';
        this.presentToast(msg);
        return; // do not attempt POST
      }

      // ❗ Anything else (e.g., missing data / status false) → try POST fallback
      console.log('⚠️ GET returned false or invalid data → trying POST');
      await this.hitPostValidate(cid, postUrl);
    } catch (errGet: any) {
      console.error('🚫 GET error:', errGet);
      console.log('🔁 Trying POST fallback');
      await this.hitPostValidate(cid, postUrl);
    } finally {
      this.loggingIn = false;
    }
  }

  private async hitPostValidate(cid: string, postUrl: string) {
    try {
      console.log(
        this.isNative ? '📨 [Native] POST:' : '📨 [Web] POST:',
        postUrl
      );
      // Send both keys so either server contract works
      const resPost: any = await this.postJson<any>(postUrl, {
        cid,
        cidNumber: cid,
      });
      console.log('📨 POST response:', resPost);

      if (resPost?.status === true) {
        console.log('🎉 POST valid → login');
        localStorage.setItem('cidNumber', cid);
        this.router.navigate(['home']);
      } else {
        console.warn('❌ POST failed:', resPost?.message);
        this.presentToast(resPost?.message ?? 'CID validation failed.');
      }
    } catch (errPost: any) {
      console.error('🚫 POST error:', errPost);
      const msg = errPost?.data?.message || errPost?.message || 'POST failed.';
      this.presentToast(
        /Unknown Error|status:\s*0/i.test(String(msg))
          ? 'Network/SSL issue. Please try again.'
          : msg
      );
    }
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
