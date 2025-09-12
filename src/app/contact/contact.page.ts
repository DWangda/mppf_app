import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.page.html',
  styleUrls: ['./contact.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    TranslateModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class ContactPage implements OnInit {
  currentLang: string;
  constructor(private translate: TranslateService) {
    this.currentLang = this.translate.currentLang;
    this.translate.onLangChange.subscribe(
      (event) => (this.currentLang = event.lang)
    );
  }

  ngOnInit() {}

  makeCall() {
    window.location.href = 'tel:1009';
  }
  sendEmail() {
    window.location.href = 'mailto:CSU.Head@nppf.org.bt';
  }
  whatsApp() {
    window.location.href = 'https://wa.me/17170884';
  }
  youtube() {
    window.location.href = 'https://www.youtube.com/@nppfofficial2374';
  }
}
