export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/rolepitch', '/rolepitch/', '/rolepitch/critique', '/rolepitch/start', '/rolepitch/report/'],
        disallow: ['/dashboard/', '/api/', '/onboarding/', '/auth/'],
      },
    ],
    sitemap: 'https://www.rolepitch.com/sitemap.xml',
  };
}
