import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-feedback',
  standalone: true,
  templateUrl: './feedback.page.html',
  styleUrls: ['./feedback.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
  ],
})
export class FeedbackPage {
  feedbackType: string = '';
  feedbackMessage: string = '';

  constructor(private http: HttpClient, private router: Router) {}

  submitFeedback() {
    console.log('Type:', this.feedbackType);
    console.log('Message:', this.feedbackMessage);

    const body = {
      feedbackType: this.feedbackType,
      feedbackMessage: this.feedbackMessage,
    };

    this.http
      .post('http://localhost:8080/api/feedbacks', body, {
        headers: { 'Content-Type': 'application/json' },
      })
      .subscribe({
        next: (res) => {
          console.log('✅ Success:', res);
          alert('Feedback sent!');
          this.router.navigate(['home']);
        },
        error: (err) => {
          console.error('❌ Error:', err);
          alert('Something went wrong.');
        },
      });
  }
}
