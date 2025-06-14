import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { App } from '@capacitor/app';
import { IonContent, IonCheckbox, IonItem } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

@Component({
  selector: 'app-term-of-service',
  templateUrl: './term-of-service.page.html',
  styleUrls: ['./term-of-service.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [IonItem, IonContent, CommonModule, IonCheckbox, FormsModule],
})
export class TermOfServicePage {
  accepted = false;
  constructor(private router: Router) {}

  goLogin() {
    this.router.navigate(['/login']);
  }
  onAccept() {
    console.log('Terms accepted');
    this.goLogin();
    // Navigate to next screen or dismiss modal
  }

  onCancel() {
    localStorage.clear();
    App.exitApp(); // 👈 closes the app (Capacitor only)
  }
}
