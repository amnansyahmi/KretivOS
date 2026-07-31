-- Starter records used by the current KretivOS prototype.

insert into customers (
  id, organization_id, name, legal_name, industry, status,
  primary_contact_name, email, phone, notes
)
values
  (
    'customer-chef-ammar', 'org-kretivco', 'Chef Ammar', 'Chef Ammar',
    'Food & Beverage', 'Active', 'Chef Ammar Al Ali',
    'chefammarproduct@gmail.com', null,
    'Marketplace, Pizza Mania and growth partnership.'
  ),
  (
    'customer-smart-selangor', 'org-kretivco', 'Smart Selangor', 'Smart Selangor',
    'Government / Public Sector', 'Active', 'Project Team',
    null, null, 'Corporate website revamp engagement.'
  ),
  (
    'customer-restu-ai', 'org-kretivco', 'Restu.ai', 'Restu.ai',
    'Technology', 'Active', 'Internal Product Team',
    null, null, 'AI wedding planning platform.'
  )
on conflict (id) do nothing;

insert into brands (id, customer_id, name, description, status)
values
  ('brand-chef-ammar', 'customer-chef-ammar', 'Chef Ammar', 'Chef Ammar master food brand.', 'Active'),
  ('brand-pizza-mania', 'customer-chef-ammar', 'Pizza Mania', 'Restaurant pizza campaign and product line.', 'Active'),
  ('brand-smart-selangor', 'customer-smart-selangor', 'Smart Selangor', 'Smart Selangor corporate digital brand.', 'Active'),
  ('brand-restu-ai', 'customer-restu-ai', 'Restu.ai', 'AI wedding planning platform.', 'Active')
on conflict (customer_id, name) do nothing;

insert into marketing_channels (id, organization_id, name, category, status, description)
values
  ('channel-facebook', 'org-kretivco', 'Facebook', 'Social Media', 'Active', 'Organic Facebook content and community.'),
  ('channel-instagram', 'org-kretivco', 'Instagram', 'Social Media', 'Active', 'Feed, Reels, Stories and direct messages.'),
  ('channel-tiktok', 'org-kretivco', 'TikTok', 'Social Media', 'Active', 'Short-form video, TikTok Shop and live content.'),
  ('channel-threads', 'org-kretivco', 'Threads', 'Social Media', 'Active', 'Conversation-led community content.'),
  ('channel-linkedin', 'org-kretivco', 'LinkedIn', 'Social Media', 'Active', 'Professional and B2B communication.'),
  ('channel-youtube', 'org-kretivco', 'YouTube', 'Video', 'Active', 'Long-form video and Shorts.'),
  ('channel-whatsapp', 'org-kretivco', 'WhatsApp', 'Messaging', 'Active', 'Direct customer communication and follow-up.'),
  ('channel-email', 'org-kretivco', 'Email', 'Owned Media', 'Active', 'Newsletter, nurture and transactional email.'),
  ('channel-website', 'org-kretivco', 'Website', 'Owned Media', 'Active', 'Corporate website and landing pages.'),
  ('channel-sales-page', 'org-kretivco', 'Sales Page', 'Commerce', 'Active', 'Direct-response landing and checkout flow.'),
  ('channel-shopee', 'org-kretivco', 'Shopee', 'Marketplace', 'Active', 'Shopee product listings, ads and store operations.'),
  ('channel-tiktok-shop', 'org-kretivco', 'TikTok Shop', 'Marketplace', 'Active', 'TikTok Shop commerce and affiliate channel.'),
  ('channel-google-search', 'org-kretivco', 'Google Search', 'Paid Media', 'Active', 'Search advertising and organic search.'),
  ('channel-google-business', 'org-kretivco', 'Google Business Profile', 'Local Discovery', 'Active', 'Maps, reviews, local search and directions.'),
  ('channel-meta-ads', 'org-kretivco', 'Meta Ads', 'Paid Media', 'Active', 'Facebook and Instagram paid advertising.'),
  ('channel-tiktok-ads', 'org-kretivco', 'TikTok Ads', 'Paid Media', 'Active', 'Paid TikTok campaign delivery.'),
  ('channel-events', 'org-kretivco', 'Events', 'Offline', 'Active', 'Launches, exhibitions and physical activations.'),
  ('channel-retail', 'org-kretivco', 'Retail / In-store', 'Offline', 'Active', 'Counter, restaurant and physical-store touchpoints.')
on conflict (organization_id, name) do nothing;
