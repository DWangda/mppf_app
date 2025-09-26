import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonSelect,
  IonBackButton,
  IonSelectOption,
  IonButton,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
interface ContactDetails {
  registeredMobile: string;
  registeredEmail: string;
  currentVillage: string;
  currentGewog: string;
  currentDzongkhag: string;
}
@Component({
  selector: 'app-contact-details',
  templateUrl: './contact-details.page.html',
  styleUrls: ['./contact-details.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    // IonSelect,
    // IonSelectOption,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    CommonModule,
    FormsModule,
  ],
})
export class ContactDetailsPage implements OnInit {
  phoneNumber = '';
  email = '';
  village = '';
  gewog = '';
  dzongkhag = '';
  constructor(private http: HttpClient) {}

  ngOnInit() {
    const cid = localStorage.getItem('cidNumber') ?? '';
    if (!cid) {
      return;
    }

    const url = `https://pensionapp.nppf.org.bt/api/plv-users/contact-details/${cid}`;
    this.http.get<any>(url).subscribe({
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
          this.resetFields();
        }
      },
      error: () => this.resetFields(),
    });
  }
  private resetFields() {
    this.phoneNumber = '';
    this.email = '';
    this.village = '';
    this.gewog = '';
    this.dzongkhag = '';
  }
}
