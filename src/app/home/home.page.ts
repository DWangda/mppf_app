import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
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
import { HttpClient } from '@angular/common/http';

// Types
interface Statement {
  taxYear: number;
  monthName: string;
  monthlyPensionAmount: number;
  cpiAdjustment: number;
  paymentDate: string;
  transactionReference: string;
}
interface TDSStatement {
  monthNameWithDate: string;
  pensionId: string;
  grossPension: number;
  arrear: number;
  lotedthContact: number;
  netPension: number;
  tds: number | null;
  receiptNumber: string;
  receiptDate: string;
}
interface LivelinessApi {
  status: boolean;
  message?: string;
  data?: {
    pensionId: string;
    cidNumber: string;
    livelinessStatus: string; // <-- this is what we use now
    biometricDate: string;
    validity: string;
    testMonth: string;
    testStartDate: string; // ISO
    testEndDate: string; // ISO
  };
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
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
    IonIcon,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('tdsTable', { static: false })
  tdsTable!: ElementRef<HTMLTableElement>;

  userName1 = localStorage.getItem('name') ?? '';

  statements: Statement[] = [];
  tdsStatements: TDSStatement[] = [];
  loading = true;

  userName = '';
  pensionId = '';
  pensionStatus = '';
  currentLang: string;
  hasNewNotification = false;

  // Existing flag used for enabling/disabling navigation
  isLivenessEnabled = false;

  // ✅ NEW: if livelinessStatus is "Valid" => hide button
  isLivelinessValid = false;

  banners: any[] = [];
  currentIndex = 0;
  currentBanner: any = null;
  autoplayInterval: any;

  // message shown in the "time" section
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

  ngOnInit() {}

  ionViewWillEnter() {
    this.onEnter();
  }

  ionViewWillLeave() {
    this.stopAutoplay();
  }

  ngOnDestroy(): void {
    this.stopAutoplay();
  }

  // ------------------------------------------------------
  // Centralized "enter page" logic (called on every entry)
  // ------------------------------------------------------
  private onEnter() {
    this.loading = true;

    this.fetchBanners();
    this.checkNewNotifications();

    // If we already have a cached pensionId, load immediately
    const cachedPid = localStorage.getItem('pensionId') ?? '';
    if (cachedPid) {
      this.pensionId = cachedPid;
      this.loadLiveliness(this.pensionId);
      this.fetchStatements(this.pensionId);
      this.fetchTDS(this.pensionId);
      return;
    }

    // Otherwise resolve it from CID, then load everything
    const cid = localStorage.getItem('cidNumber');
    if (!cid) {
      this.loading = false;
      return;
    }

    const url = `https://pensionapp.nppf.org.bt/api/plv-users/by-cid/${encodeURIComponent(
      cid
    )}`;
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

            // Now that we have a PID, fetch ALL Home data
            this.loadLiveliness(this.pensionId);
            this.fetchStatements(this.pensionId);
            this.fetchTDS(this.pensionId);
            return;
          }
        }

        // No valid pensionId
        this.userName = '';
        this.loading = false;
      },
      error: () => {
        this.userName = '';
        this.loading = false;
      },
    });
  }

  // --------------------------
  // Statements + TDS loaders
  // --------------------------
  private fetchStatements(pid: string) {
    if (!pid) return;
    const url = `https://pensionapp.nppf.org.bt/api/pension-statements/monthly/${encodeURIComponent(
      pid
    )}`;
    this.http.get<Statement[]>(url).subscribe({
      next: (data) => {
        this.statements = data ?? [];
        this.loading = false;
      },
      error: () => {
        this.statements = [];
        this.loading = false;
      },
    });
  }

  private fetchTDS(pid: string) {
    if (!pid) return;
    const url = `https://pensionapp.nppf.org.bt/api/pension-statements/${encodeURIComponent(
      pid
    )}`;
    this.http
      .get<{ status: boolean; message: string; data: TDSStatement[] }>(url)
      .subscribe({
        next: (res) => {
          this.tdsStatements = res?.data ?? [];
          this.loading = false;
        },
        error: () => {
          this.tdsStatements = [];
          this.loading = false;
        },
      });
  }

  // =========================
  // Liveliness logic
  // =========================
  private loadLiveliness(pensionId: string) {
    if (!pensionId) return;

    const rawStatus =
      localStorage.getItem('pensionStatus') ??
      localStorage.getItem('pentionStatus'); // legacy key fallback

    const pensionStatus = rawStatus
      ? rawStatus.replace(/['"]/g, '').trim().padStart(2, '0')
      : '';

    // Reset flags each time
    this.isLivelinessValid = false;
    this.isLivenessEnabled = false;

    if (pensionStatus === '03') {
      this.livelinessMessage =
        'Your Pension account is suspended. Please contact NPPF admin';
      return;
    }
    if (pensionStatus === '01') {
      this.livelinessMessage =
        'Your Pension account is pending. Please contact NPPF admin';
      return;
    }
    if (pensionStatus === '04') {
      this.livelinessMessage =
        'Your Pension account is ceased. Please contact NPPF admin';
      return;
    }

    const url = `https://pensionapp.nppf.org.bt/api/liveliness/${encodeURIComponent(
      pensionId
    )}`;
    this.http.get<LivelinessApi>(url).subscribe({
      next: (res) => {
        if (!res?.status || !res.data) {
          this.livelinessMessage = 'Liveliness test status unavailable.';
          this.isLivenessEnabled = false;
          this.isLivelinessValid = false;
          return;
        }

        // ✅ 1) Hide button when livelinessStatus is "Valid"
        const livStatus = (res.data.livelinessStatus ?? '')
          .toString()
          .trim()
          .toLowerCase();

        this.isLivelinessValid = livStatus === 'valid';

        if (this.isLivelinessValid) {
          const validityDate = new Date(res.data.validity);
          this.livelinessMessage = Number.isNaN(validityDate.getTime())
            ? 'Liveliness status: Valid.'
            : `Liveliness status: Valid until ${this.formatMonthDayYear(
                validityDate
              )}.`;
          this.isLivenessEnabled = false; // also disable navigation
          return;
        }

        // ✅ 2) If NOT valid, then use your existing window logic
        const now = new Date();
        const start = new Date(res.data.testStartDate);
        const end = new Date(res.data.testEndDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          this.livelinessMessage = 'Invalid test window received.';
          this.isLivenessEnabled = false;
          return;
        }

        // BEFORE window
        if (now < start) {
          const daysLeft = this.daysCeil(now, start);
          this.livelinessMessage = `Remaining days for liveliness test: ${daysLeft} Days`;
          this.isLivenessEnabled = false;
          return;
        }

        // WITHIN window
        if (now <= end) {
          this.livelinessMessage = `Your liveliness test is scheduled for ${this.formatMonthDay(
            now
          )} to ${this.formatMonthDay(end)}.`;
          this.isLivenessEnabled = true;
          return;
        }

        // AFTER window
        this.livelinessMessage = `Liveliness test window was on ${this.formatMonthDayYear(
          start
        )}.`;
        this.isLivenessEnabled = false;
      },
      error: (err) => {
        this.livelinessMessage =
          err?.error?.message ||
          (typeof err?.error === 'string'
            ? err.error
            : 'Could not fetch liveliness test status.');
        this.isLivenessEnabled = false;
        this.isLivelinessValid = false;
      },
    });
  }

  private formatMonthDay(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }

  private formatMonthDayYear(d: Date): string {
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
    const fileName = (banner.resourcePath || '').split('/').pop();
    const folder =
      (banner.resourceType || '').toLowerCase() === 'image'
        ? 'images'
        : 'videos';
    return `https://pensionapp.nppf.org.bt/${folder}/${fileName}`;
  }

  fetchBanners() {
    this.http.get<any>('https://pensionapp.nppf.org.bt/api/banner').subscribe({
      next: (res) => {
        const data: any[] = Array.isArray(res?.data) ? res.data : [];

        const isYes = (v: any) => {
          if (typeof v === 'boolean') return v;
          const s = (v ?? '').toString().trim().toLowerCase();
          return s === 'yes' || s === 'y' || s === 'true' || s === '1';
        };

        const visible = data.filter((b) => isYes(b?.displayStatus));

        const source = visible.length > 0 ? visible : data;
        const maxCount = visible.length > 0 ? 4 : 1;

        const seen = new Set<string>();
        const dedup = source.filter((b: any) => {
          const key = (b?.resourcePath || '').toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const sorted = dedup.sort(
          (a: any, b: any) =>
            new Date(b?.queryTimestamp ?? 0).getTime() -
            new Date(a?.queryTimestamp ?? 0).getTime()
        );

        const limited = sorted.slice(0, maxCount);

        this.banners = limited.sort((a: any, b: any) => {
          const at = (a?.resourceType || '').toLowerCase();
          const bt = (b?.resourceType || '').toLowerCase();
          if (at === 'image' && bt === 'video') return -1;
          if (at === 'video' && bt === 'image') return 1;
          return 0;
        });

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
    this.http
      .get<any[]>('https://pensionapp.nppf.org.bt/api/notifications')
      .subscribe({
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

  goToStatement() {
    this.router.navigate(['/statement']);
  }

  goToTDSReport() {
    this.router.navigate(['/tds']);
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
