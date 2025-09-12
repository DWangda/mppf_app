import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonButtons,
  IonBackButton,
  IonItem,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface PensionSchemeDto {
  pensionId: string;
  name: string;
  cid: string;
  pensionSavingAccount: string;
  dzongkhag: string | null;
  pensionStatus: string;
  pensionType: string;
  monthlyPensionAmount: number | null;
  currentYearPensionIncrement: number | null;
  commencementDate: string | null;
  lotedth: boolean;
}
interface ContactDetails {
  registeredMobile: string;
  registeredEmail: string;
  currentVillage: string;
  currentGewog: string;
  currentDzongkhag: string;
}

@Component({
  selector: 'app-user-details',
  templateUrl: './user-details.page.html',
  styleUrls: ['./user-details.page.scss'],
  standalone: true,
  imports: [
    IonBackButton,
    IonButtons,
    IonButton,
    IonContent,
    IonHeader,
    TranslateModule,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class UserDetailsPage implements OnInit {
  /* ---------- template bindings ---------- */
  fullName = '';
  cidNumber = '';
  pensionId = '';
  pensionStatus = '';
  pensionType = '';
  pensionAccount = '';
  monthlyPensionAmount = '';
  currentYearIncrementPct = '';
  commencementDate = '';
  lotedth = '';
  phoneNumber = '';
  email = '';
  village = '';
  gewog = '';
  dzongkhag = '';
  currentLang: string;
  constructor(private http: HttpClient, private translate: TranslateService) {
    this.currentLang = this.translate.currentLang;
    this.translate.onLangChange.subscribe(
      (event) => (this.currentLang = event.lang)
    );
  }

  // ngOnInit() {
  //   const cid = localStorage.getItem('cidNumber') ?? '';
  //   if (!cid) {
  //     return;
  //   }

  //   const url = `https://202.144.158.3/nga-yoe/api/pension-scheme-details/${cid}`;

  //   this.http.get<any>(url).subscribe({
  //     next: (res) => {
  //       const dto: PensionSchemeDto | undefined = res?.status
  //         ? (res.data as PensionSchemeDto)
  //         : undefined;

  //       if (dto) {
  //         this.fullName = dto.name ?? '';
  //         this.cidNumber = dto.cid ?? '';
  //         this.pensionId = dto.pensionId ?? '';
  //         this.pensionStatus = dto.pensionStatus ?? '';
  //         this.pensionType = dto.pensionType ?? '';
  //         this.pensionAccount = dto.pensionSavingAccount ?? '';
  //         this.monthlyPensionAmount =
  //           dto.monthlyPensionAmount != null
  //             ? `Nu. ${dto.monthlyPensionAmount}`
  //             : '‑‑';
  //         this.currentYearIncrementPct =
  //           dto.currentYearPensionIncrement != null
  //             ? `${dto.currentYearPensionIncrement}%`
  //             : '‑‑';
  //       } else {
  //         this.resetFields();
  //       }
  //     },
  //     error: () => this.resetFields(),
  //   });
  // }
  ngOnInit() {
    const cid = localStorage.getItem('cidNumber') ?? '';
    if (!cid) {
      return;
    }

    const url = `https://202.144.158.3/nga-yoe/api/pension-scheme-details/by-cid/${cid}`;

    this.http.get<any>(url).subscribe({
      next: (res) => {
        const dto: PensionSchemeDto | undefined = res?.status
          ? (res.data as PensionSchemeDto)
          : undefined;

        if (dto) {
          this.fullName = dto.name ?? '';
          this.cidNumber = dto.cid ?? '';
          this.pensionId = dto.pensionId ?? '';
          this.pensionStatus = dto.pensionStatus ?? '';
          this.pensionType = dto.pensionType ?? '';
          this.pensionAccount = dto.pensionSavingAccount ?? '';
          this.commencementDate = dto.commencementDate ?? '';
          this.monthlyPensionAmount =
            dto.monthlyPensionAmount != null
              ? `Nu. ${dto.monthlyPensionAmount}`
              : '––';
          this.currentYearIncrementPct =
            dto.currentYearPensionIncrement != null
              ? `${dto.currentYearPensionIncrement}%`
              : '––';
          localStorage.setItem(
            'commencementDate',
            String(this.commencementDate).split('T')[0] // → "2024-10-03"
          );
          // 🔽 Call the lotedth API using the fetched pensionId
          this.http
            .get<any>(
              `https://202.144.158.3/nga-yoe/api/lotedth/check/${dto.pensionId}`
            )
            .subscribe({
              next: (lotedthRes) => {
                this.lotedth = lotedthRes?.status ? 'Yes' : 'No';
              },
              error: () => {
                this.lotedth = 'No';
              },
            });
        } else {
          this.resetFields();
        }
      },
      error: () => this.resetFields(),
    });
    const url1 = `https://202.144.158.3/nga-yoe/api/plv-users/contact-details/${cid}`;
    this.http.get<any>(url1).subscribe({
      next: (res) => {
        const cond: ContactDetails | undefined = res?.status
          ? (res.data as ContactDetails)
          : undefined;
        if (cond) {
          this.phoneNumber = cond.registeredMobile ?? '';
          this.email = cond.registeredEmail ?? '--';
          this.village = cond.currentVillage ?? '';
          this.gewog = cond.currentGewog ?? '';
          this.dzongkhag = cond.currentDzongkhag ?? '';
        } else {
          this.resetFields1();
        }
      },
      error: () => this.resetFields1(),
    });
  }

  private resetFields() {
    this.fullName =
      this.cidNumber =
      this.pensionId =
      this.pensionStatus =
      this.pensionType =
      this.pensionAccount =
      this.monthlyPensionAmount =
      this.currentYearIncrementPct =
      this.lotedth =
        '‑‑';
  }
  private resetFields1() {
    this.phoneNumber = '';
    this.email = '';
    this.village = '';
    this.gewog = '';
    this.dzongkhag = '';
  }
}
