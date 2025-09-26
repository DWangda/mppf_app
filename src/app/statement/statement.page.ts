import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonBackButton,
  IonButtons,
  IonButton,
  IonSpinner,
  IonIcon,
} from '@ionic/angular/standalone';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface Statement {
  taxYear: number;
  monthName: string;
  monthlyPensionAmount: number;
  cpiAdjustment: number;
  paymentDate: string;
  transactionReference: string;
}
@Component({
  selector: 'app-statement',
  templateUrl: './statement.page.html',
  styleUrls: ['./statement.page.scss'],
  standalone: true,
  imports: [
    IonSpinner,
    // Ionic
    IonButton,
    TranslateModule,
    IonButtons,
    IonBackButton,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    // Angular
    CommonModule,
    FormsModule,
    HttpClientModule,
  ],
})
export class StatementPage implements OnInit {
  @ViewChild('tdsTable', { static: false })
  tdsTable!: ElementRef<HTMLTableElement>;
  statements: Statement[] = [];
  loading = true;
  currentLang: string;

  constructor(private http: HttpClient, private translate: TranslateService) {
    this.currentLang = this.translate.currentLang;
    this.translate.onLangChange.subscribe(
      (event) => (this.currentLang = event.lang)
    );
  }

  ngOnInit(): void {
    // ▸ however you store / retrieve the pensionId:
    const pensionId = localStorage.getItem('pensionId') ?? ''; // e.g. "CN00002411-000"
    if (!pensionId) {
      this.loading = false;
      return;
    }

    const url = `https://pensionapp.nppf.org.bt/api/pension-statements/monthly/${pensionId}`;

    this.http.get<Statement[]>(url).subscribe({
      next: (data) => {
        this.statements = data ?? [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.statements = [];
      },
    });
  }
  async exportPdf(): Promise<void> {
    if (!this.tdsTable) {
      return;
    }

    // Make a canvas out of the table
    const canvas = await html2canvas(this.tdsTable.nativeElement, {
      backgroundColor: '#ffffff', // clean white BG
      scale: 2, // sharper on retina
    });

    const imgData = canvas.toDataURL('image/png');

    // Choose orientation based on table width
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'l' : 'p',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('TDS_Report.pdf');
  }
}
