import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TermOfServicePage } from './term-of-service.page';

describe('TermOfServicePage', () => {
  let component: TermOfServicePage;
  let fixture: ComponentFixture<TermOfServicePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TermOfServicePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
