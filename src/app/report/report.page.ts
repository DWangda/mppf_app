import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonSelect,
  IonSelectOption,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonButtons,
  IonBackButton,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';

@Component({
  selector: 'app-report',
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonButton,

    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class ReportPage implements OnInit {
  constructor(private router: Router) {}

  ngOnInit() {}

  pensionID = localStorage.getItem('pensionId') ?? '';

  goToTDS() {
    this.router.navigate(['/tds']);
  }
  goToStatement() {
    this.router.navigate(['/statement']);
  }
}
