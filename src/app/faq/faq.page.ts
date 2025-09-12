import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonButtons,
  IonBackButton,
  IonAccordionGroup,
  IonAccordion,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-faq',
  templateUrl: './faq.page.html',
  styleUrls: ['./faq.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonButton,
    IonLabel,
    IonItem,
    IonList,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class FaqPage implements OnInit {
  faqs: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchFaqs();
  }

  fetchFaqs() {
    this.http.get<any[]>('https://202.144.158.3/nga-yoe/api/faqs').subscribe({
      next: (data) => {
        // Optionally sort by displayOrder
        this.faqs = data
          .filter((faq) => faq.isActive)
          .sort((a, b) => a.displayOrder - b.displayOrder);
      },
      error: () => {
        this.faqs = [];
      },
    });
  }
}
