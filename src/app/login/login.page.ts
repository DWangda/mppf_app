/**************************************************************************
 * login.page.ts  –  Ionic/Angular (login-only version)
 * -----------------------------------------------------------------------
 * • Immediately fetches the login proof-request URL
 * • Listens to the NATS thread-ID stream for validation
 * • Opens the deep link when it arrives (optional but handy)
 * • Cleans up NATS subscription on destroy
 **************************************************************************/

import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  NgZone,
  OnInit,
  OnDestroy,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  ToastController,
  IonSpinner,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';

/* ---------- NATS client --------- */
import {
  connect,
  StringCodec,
  Subscription,
  NatsConnection,
  nkeyAuthenticator,
} from 'nats.ws';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],

  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [IonButton, IonContent, CommonModule, FormsModule],
})
export class LoginPage {
  /* ---------------- state bound in the template ------------------------ */

  constructor() {}

  /* ==================== AUTO-START LOGIN FLOW ========================== */
  ngOnInit() {}

  /* ===================== FETCH PROOF REQUEST =========================== */
}
