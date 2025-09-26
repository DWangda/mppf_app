import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonBackButton,
  IonList,
  IonItem,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface Notification {
  id: number;
  notificationType: string;
  notificationTitle: string;
  notificationMessage: string;
  sentDate: string | null;
}

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [
    // IonRefresherContent,
    // IonRefresher,
    // Ionic
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonToolbar,
    // IonList,
    IonItem,
    IonLabel,
    // Angular
    CommonModule,
    FormsModule,
    TranslateModule,
    HttpClientModule,
  ],
  providers: [DatePipe],
  templateUrl: './notification.page.html',
  styleUrls: ['./notification.page.scss'],
})
export class NotificationPage implements OnInit {
  notifications: Notification[] = [];
  loading = false;
  currentLang: string;

  constructor(
    private http: HttpClient,
    private datePipe: DatePipe,
    private translate: TranslateService
  ) {
    this.currentLang = this.translate.currentLang;
    this.translate.onLangChange.subscribe(
      (event) => (this.currentLang = event.lang)
    );
  }

  ngOnInit(): void {
    this.fetchNotifications();
  }

  /** Called from the template pull-to-refresh */
  refresh(ev?: Event): void {
    this.fetchNotifications(() => (ev ? (ev.target as any).complete() : null));
  }

  private fetchNotifications(done?: () => void): void {
    this.loading = true;
    const url = 'https://pensionapp.nppf.org.bt/api/notifications';

    this.http.get<{ status: boolean; data: Notification[] }>(url).subscribe({
      next: (res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        this.notifications = list
          .slice() // copy
          .sort((a, b) => {
            const da = a.sentDate ? new Date(a.sentDate).getTime() : 0;
            const db = b.sentDate ? new Date(b.sentDate).getTime() : 0;
            return db - da; // newest first; nulls last
          });
      },
      error: () => (this.notifications = []),
      complete: () => {
        this.loading = false;
        done?.();
      },
    });
  }

  /** Helper for template date display */
  formatDate(d: string | null): string {
    return d ? this.datePipe.transform(d, 'MMM d, y • h:mm a') ?? '' : '';
  }
  /** trackBy for *ngFor */
  trackById(_: number, item: Notification): number {
    return item.id;
  }

  /** initials for avatar */
  getInitials(text: string): string {
    const words = text.trim().split(/\s+/);
    return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  }
}
