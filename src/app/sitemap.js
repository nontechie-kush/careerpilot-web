export default function sitemap() {
  const base = 'https://www.rolepitch.com';
  const now = new Date().toISOString();

  return [
    {
      url: `${base}/rolepitch`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/rolepitch/critique`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/rolepitch/start`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
