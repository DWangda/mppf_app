import {
  Component,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenu,
  IonMenuButton,
  IonTitle,
  IonToolbar,
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardSubtitle,
  IonCardHeader,
  IonToggle,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { heart, calendar, musicalNote, notifications } from 'ionicons/icons';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    TranslateModule,

    // Ionic standalone components
    IonToggle,
    IonCardHeader,
    IonCardSubtitle,
    IonCard,
    IonCol,
    IonRow,
    IonGrid,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenu,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HomePage implements OnInit, OnDestroy {
  userName = '';
  pensionId = '';
  pensionStatus = '';
  currentLang: string;
  hasNewNotification = false;
  isLivenessEnabled = false;

  banners: any[] = [];
  currentIndex = 0;
  currentBanner: any = null;
  autoplayInterval: any;

  // NEW: message shown in the "time" section
  livelinessMessage = '—';

  slideOpts: any = {
    autoplay: { delay: 4000 },
    loop: true,
    speed: 600,
  };

  constructor(
    private router: Router,
    private http: HttpClient,
    private nav: NavController,
    private translate: TranslateService
  ) {
    this.currentLang = this.translate.currentLang;
    this.translate.onLangChange.subscribe(
      (event) => (this.currentLang = event.lang)
    );
    addIcons({ heart, calendar, musicalNote, notifications });
  }

  ngOnInit() {
    this.fetchBanners();

    // If a pensionId already exists (from a previous session), try loading liveliness immediately
    const cachedPid = localStorage.getItem('pensionId');
    if (cachedPid) {
      this.pensionId = cachedPid;
      this.loadLiveliness(this.pensionId);
    }

    // Get user details (and pensionId) from CID
    const cid = localStorage.getItem('cidNumber');
    if (cid) {
      const url = `http://localhost:8080/api/plv-users/by-cid/${cid}`;
      this.http.get<any>(url).subscribe({
        next: (res) => {
          if (res?.status && Array.isArray(res.data) && res.data.length) {
            this.userName = res.data[0].name ?? '';
            this.pensionId = res.data[0].pensionId ?? '';
            this.pensionStatus = res.data[0].pensionStatus ?? '';
            const address = res.data[0].currentDzongkhag ?? '';
            const accountNumber = res.data[0].pensionAccount ?? '';
            if (this.pensionId) {
              localStorage.setItem('name', this.userName);
              localStorage.setItem('cid', cid);
              localStorage.setItem('address', address);
              localStorage.setItem('pensionId', this.pensionId);
              localStorage.setItem('pensionStatus', this.pensionStatus);
              localStorage.setItem('accountNumber', accountNumber);
              this.loadLiveliness(this.pensionId); // load after we’re sure
            }
          } else {
            this.userName = '';
          }
        },
        error: () => (this.userName = ''),
      });
    }

    this.checkNewNotifications();
  }

  ngOnDestroy(): void {
    this.stopAutoplay();
  }

  // =========================
  // Liveliness logic
  // =========================

  private loadLiveliness(pensionId: string) {
    if (!pensionId) return;
    const rawStatus =
      localStorage.getItem('pensionStatus') ??
      localStorage.getItem('pentionStatus');

    const pensionStatus = rawStatus
      ? rawStatus.replace(/['"]/g, '').trim().padStart(2, '0') // normalize "3" -> "03"
      : '';

    if (pensionStatus === '03') {
      this.livelinessMessage =
        'Your Pention account is suspended. Please contact NPPF admin';
      this.isLivenessEnabled = false;
      return; // short-circuit
    }
    if (pensionStatus === '01') {
      this.livelinessMessage =
        'Your Pention account is on Pending. Please contact NPPF admin';
      this.isLivenessEnabled = false;
      return; // short-circuit
    }
    if (pensionStatus === '04') {
      this.livelinessMessage =
        'Your Pention account is ceased. Please contact NPPF admin';
      this.isLivenessEnabled = false;
      return; // short-circuit
    }
    const url = `http://localhost:8080/api/liveliness/${encodeURIComponent(
      pensionId
    )}`;
    this.http.get<LivelinessApi>(url).subscribe({
      next: (res) => {
        if (!res?.status || !res.data) {
          this.livelinessMessage = 'Liveliness test status unavailable.';
          this.isLivenessEnabled = false;
          return;
        }

        const now = new Date();
        const start = new Date(res.data.testStartDate);
        const end = new Date(res.data.testEndDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          this.livelinessMessage = 'Invalid test window received.';
          return;
        }

        // BEFORE window: now < start
        if (now < start) {
          const daysLeft = this.daysCeil(now, start);

          this.livelinessMessage = `Remaining days for liveliness test: ${daysLeft} Days`;

          this.isLivenessEnabled = false;
          return;
        }

        // WITHIN window: start ≤ now ≤ end
        if (now < end) {
          this.livelinessMessage = `Your liveliness test is scheduled for ${this.formatMonthDay(
            now
          )} to ${this.formatMonthDay(end)}.`;

          this.isLivenessEnabled = true;
          return;
        }

        this.livelinessMessage = `Liveliness test window was on ${this.formatMonthDayYear(
          start
        )}.`;
        this.isLivenessEnabled = false;
      },
      error: (err) => {
        this.livelinessMessage =
          err.error?.message ||
          (typeof err.error === 'string'
            ? err.error
            : 'Could not fetch liveliness test status.');
        this.isLivenessEnabled = false;
      },
    });
  }

  private formatMonthDay(d: Date): string {
    // Example: "December 1"
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }
  private formatMonthDayYear(d: Date): string {
    // Example: "December 1"
    return d.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private daysCeil(from: Date, to: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / msPerDay));
  }

  // =========================
  // Banners
  // =========================

  convertToUrl(banner: any): string {
    const fileName = banner.resourcePath.split('\\').pop();
    const folder =
      banner.resourceType.toLowerCase() === 'image' ? 'images' : 'videos';
    return `http://localhost:8080/media/${folder}/${fileName}`;
  }

  fetchBanners() {
    this.http.get<any>('http://localhost:8080/api/banner').subscribe({
      next: (res) => {
        const data: any[] = Array.isArray(res?.data) ? res.data : [];

        // Normalize "yes" values (accepts yes/y/true/1 and booleans)
        const isYes = (v: any) => {
          if (typeof v === 'boolean') return v;
          const s = (v ?? '').toString().trim().toLowerCase();
          return s === 'yes' || s === 'y' || s === 'true' || s === '1';
        };

        // 1) Visible (preferred)
        const visible = data.filter((b) => isYes(b?.displayStatus));

        // 2) Choose source list:
        //    - If there are visible banners => use those (up to 4)
        //    - If not => fallback to ALL banners but take ONLY 1 (min-1 guarantee)
        const source = visible.length > 0 ? visible : data;
        const maxCount = visible.length > 0 ? 4 : 1;

        // 3) De-duplicate by resourcePath (case-insensitive, trimmed)
        const seen = new Set<string>();
        const dedup = source.filter((b: any) => {
          const key = (b?.resourcePath || '').toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // 4) Sort by timestamp desc
        const sorted = dedup.sort(
          (a: any, b: any) =>
            new Date(b?.queryTimestamp ?? 0).getTime() -
            new Date(a?.queryTimestamp ?? 0).getTime()
        );

        // 5) Limit count (max 4 normally; fallback shows 1)
        const limited = sorted.slice(0, maxCount);

        // 6) Put images first, then videos
        this.banners = limited.sort((a: any, b: any) => {
          const at = (a?.resourceType || '').toLowerCase();
          const bt = (b?.resourceType || '').toLowerCase();
          if (at === 'image' && bt === 'video') return -1;
          if (at === 'video' && bt === 'image') return 1;
          return 0;
        });

        // 7) Set current & autoplay only if we have at least 1
        if (this.banners.length > 0) {
          this.currentIndex = 0;
          this.currentBanner = this.banners[0];
          this.startAutoplay?.();
        } else {
          this.currentBanner = null;
          this.stopAutoplay?.();
        }
      },
      error: () => {
        this.banners = [];
        this.currentBanner = null;
        this.stopAutoplay?.();
      },
    });
  }

  nextBanner() {
    if (this.banners.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.banners.length;
      this.currentBanner = this.banners[this.currentIndex];
    }
  }

  prevBanner() {
    if (this.banners.length > 0) {
      this.currentIndex =
        (this.currentIndex - 1 + this.banners.length) % this.banners.length;
      this.currentBanner = this.banners[this.currentIndex];
    }
  }

  startAutoplay() {
    this.stopAutoplay();
    this.autoplayInterval = setInterval(() => this.nextBanner(), 5000);
  }

  stopAutoplay() {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }

  // =========================
  // Notifications
  // =========================

  checkNewNotifications() {
    this.http.get<any[]>('http://localhost:8080/api/notifications').subscribe({
      next: (data) => (this.hasNewNotification = !!(data && data.length > 0)),
      error: () => (this.hasNewNotification = false),
    });
  }

  // =========================
  // Navigation
  // =========================

  goToContact() {
    this.router.navigate(['/contact']);
  }

  goToNotification() {
    this.hasNewNotification = false;
    localStorage.setItem('notificationsViewed', 'true');
    this.router.navigate(['/notification']);
  }

  goToUserDetails() {
    this.router.navigate(['/user-details']);
  }

  goToContactDetails() {
    this.router.navigate(['/contact-details']);
  }

  goToReport() {
    this.router.navigate(['/report']);
  }

  goToLiveness() {
    this.router.navigate(['/liveness']);
  }

  goToFeedback() {
    this.router.navigate(['/feedback']);
  }

  goToFAQ() {
    this.router.navigate(['/faq']);
  }
  goToAbout() {
    this.router.navigate(['/about']);
  }
  goToPolicy() {
    this.router.navigate(['/policy']);
  }

  logout(): void {
    localStorage.clear();
    sessionStorage.clear();
    this.nav.navigateRoot('/ndi-login', {
      animated: true,
      animationDirection: 'back',
    });
  }
}

// Types
interface LivelinessApi {
  status: boolean;
  message?: string;
  data?: {
    pensionId: string;
    cidNumber: string;
    livelinessStatus: string;
    biometricDate: string;
    validity: string;
    testMonth: string;
    testStartDate: string; // ISO
    testEndDate: string; // ISO
  };
}
