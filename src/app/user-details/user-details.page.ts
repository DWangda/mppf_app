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

  constructor(private http: HttpClient) {}

  // ngOnInit() {
  //   const cid = localStorage.getItem('cidNumber') ?? '';
  //   if (!cid) {
  //     return;
  //   }

  //   const url = `http://localhost:8080/api/pension-scheme-details/${cid}`;

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

    const url = `http://localhost:8080/api/pension-scheme-details/by-cid/${cid}`;

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
              `http://localhost:8080/api/lotedth/check/${dto.pensionId}`
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
}
