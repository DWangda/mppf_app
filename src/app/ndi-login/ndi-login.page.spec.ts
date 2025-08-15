import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NdiLoginPage } from './ndi-login.page';

describe('NdiLoginPage', () => {
  let component: NdiLoginPage;
  let fixture: ComponentFixture<NdiLoginPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NdiLoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
