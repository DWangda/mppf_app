import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'term-of-service',
    pathMatch: 'full',
  },

  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'term-of-service',
    loadComponent: () =>
      import('./term-of-service/term-of-service.page').then(
        (m) => m.TermOfServicePage
      ),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'notification',
    loadComponent: () =>
      import('./notification/notification.page').then(
        (m) => m.NotificationPage
      ),
  },
  {
    path: 'user-details',
    loadComponent: () =>
      import('./user-details/user-details.page').then((m) => m.UserDetailsPage),
  },
  {
    path: 'contact-details',
    loadComponent: () =>
      import('./contact-details/contact-details.page').then(
        (m) => m.ContactDetailsPage
      ),
  },
  {
    path: 'report',
    loadComponent: () =>
      import('./report/report.page').then((m) => m.ReportPage),
  },
  {
    path: 'ndi-login',
    loadComponent: () =>
      import('./ndi-login/ndi-login.page').then((m) => m.NdiLoginPage),
  },
  {
    path: 'tds',
    loadComponent: () => import('./tds/tds.page').then((m) => m.TDSPage),
  },
  {
    path: 'statement',
    loadComponent: () =>
      import('./statement/statement.page').then((m) => m.StatementPage),
  },
  {
    path: 'liveness',
    loadComponent: () =>
      import('./liveness/liveness.page').then((m) => m.LivenessPage),
  },
  {
    path: 'feedback',
    loadComponent: () =>
      import('./feedback/feedback.page').then((m) => m.FeedbackPage),
  },
  {
    path: 'faq',
    loadComponent: () => import('./faq/faq.page').then((m) => m.FaqPage),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'policy',
    loadComponent: () => import('./policy/policy.page').then( m => m.PolicyPage)
  },
];
