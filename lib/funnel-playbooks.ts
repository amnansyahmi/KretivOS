export type PlaybookStageKey = "TOFU" | "MOFU" | "BOFU" | "RETENTION";

export type PlaybookActivity = {
  title: string;
  format: string;
  cta: string;
  channelSuggestions: string[];
};

export type PlaybookStage = {
  key: PlaybookStageKey;
  title: string;
  objective: string;
  kpi: string;
  activities: PlaybookActivity[];
};

export type FunnelPlaybook = {
  key: string;
  name: string;
  category: string;
  bestFor: string[];
  buyingCycle: "Immediate" | "Short" | "Medium" | "Long";
  description: string;
  risks: string[];
  stages: PlaybookStage[];
};

const activity = (title: string, format: string, cta: string, channelSuggestions: string[]): PlaybookActivity => ({ title, format, cta, channelSuggestions });
const stage = (key: PlaybookStageKey, title: string, objective: string, kpi: string, activities: PlaybookActivity[]): PlaybookStage => ({ key, title, objective, kpi, activities });

export const FUNNEL_PLAYBOOKS: FunnelPlaybook[] = [
  {
    key: "aida",
    name: "AIDA — Attention, Interest, Desire, Action",
    category: "Universal",
    bestFor: ["Campaign launches", "Direct response", "Simple offers"],
    buyingCycle: "Short",
    description: "A classic persuasion sequence that moves an audience from attention to a clear action.",
    risks: ["Can become overly promotional", "Needs strong differentiation and proof"],
    stages: [
      stage("TOFU", "Attention", "Interrupt the audience with a relevant problem, desire or visual hook.", "Reach, thumb-stop rate, video views", [activity("Problem or aspiration hook", "Short video / static creative", "Learn more", ["Social Media", "Paid Media"])]),
      stage("MOFU", "Interest", "Explain the offer and why it matters to this audience.", "Engagement, saves, landing-page views", [activity("Benefit explainer", "Carousel / landing section", "See how it works", ["Social Media", "Owned Media"])]),
      stage("BOFU", "Desire & Action", "Use proof, urgency and a focused CTA to convert.", "Leads, purchases, bookings", [activity("Proof plus offer", "Testimonial / conversion page", "Buy now", ["Paid Media", "Commerce", "Messaging"])]),
      stage("RETENTION", "Reinforcement", "Confirm the decision and create the next action.", "Repeat rate, reviews, referrals", [activity("Post-purchase follow-up", "Email / message", "Review or return", ["Owned Media", "Messaging"])]),
    ],
  },
  {
    key: "tofu-mofu-bofu",
    name: "TOFU / MOFU / BOFU",
    category: "Universal",
    bestFor: ["Always-on marketing", "Multi-channel campaigns", "Content systems"],
    buyingCycle: "Medium",
    description: "A full-funnel structure separating awareness, consideration, conversion and retention work.",
    risks: ["Teams may produce too much awareness content", "Requires stage-specific measurement"],
    stages: [
      stage("TOFU", "Awareness", "Reach qualified new audiences and create category interest.", "Reach, impressions, video views", [activity("Educational awareness content", "Video / article", "Discover", ["Social Media", "Video", "Paid Media"])]),
      stage("MOFU", "Consideration", "Build trust and help prospects compare options.", "Engaged visits, leads, saves", [activity("Comparison and proof", "Guide / case study", "Explore options", ["Owned Media", "Social Media", "Email"])]),
      stage("BOFU", "Conversion", "Remove objections and make the purchase or enquiry easy.", "Conversion rate, CPA, revenue", [activity("Offer and objection handling", "Sales page / consultation", "Get started", ["Commerce", "Messaging", "Paid Media"])]),
      stage("RETENTION", "Retention", "Increase repeat value, advocacy and referral.", "Repeat revenue, NPS, referral", [activity("Customer success follow-up", "Email / community", "Return or refer", ["Email", "Messaging", "Community"])]),
    ],
  },
  {
    key: "see-think-do-care",
    name: "See–Think–Do–Care",
    category: "Universal",
    bestFor: ["Long-term brand growth", "Search and content", "Mixed intent audiences"],
    buyingCycle: "Medium",
    description: "Organises marketing around audience intent instead of forcing every person toward immediate conversion.",
    risks: ["Needs broad content coverage", "Attribution must recognise assisted conversions"],
    stages: [
      stage("TOFU", "See", "Serve the largest qualified audience with useful or entertaining category content.", "Qualified reach, attention", [activity("Category insight", "Video / editorial", "Explore", ["Video", "Social Media", "Owned Media"])]),
      stage("MOFU", "Think", "Help audiences showing consideration understand options and fit.", "Return visits, comparison actions", [activity("Buyer guide", "Guide / webinar", "Compare", ["Owned Media", "Email", "Search"])]),
      stage("BOFU", "Do", "Capture high-intent demand with a frictionless action path.", "Sales, leads, bookings", [activity("High-intent conversion page", "Landing page", "Buy or enquire", ["Search", "Commerce", "Messaging"])]),
      stage("RETENTION", "Care", "Support existing customers and earn repeat purchase or advocacy.", "Retention, reviews, referrals", [activity("Customer value programme", "Email / community", "Get more value", ["Email", "Messaging", "Community"])]),
    ],
  },
  {
    key: "product-launch",
    name: "Product Launch Funnel",
    category: "Launch",
    bestFor: ["New products", "New menu items", "Feature releases"],
    buyingCycle: "Short",
    description: "Builds anticipation, reveals the product, converts early demand and sustains momentum after launch.",
    risks: ["Demand may peak too early", "Weak operational readiness can damage trust"],
    stages: [
      stage("TOFU", "Tease", "Create curiosity without revealing every detail.", "Reach, waitlist growth", [activity("Teaser reveal", "Short video / countdown", "Join the launch", ["Social Media", "Video", "Paid Media"])]),
      stage("MOFU", "Educate & Reveal", "Show the product, use case, proof and launch details.", "Waitlist engagement, product views", [activity("Product reveal and demonstration", "Launch video / live", "See the product", ["Video", "Social Media", "Email"])]),
      stage("BOFU", "Launch Offer", "Convert pent-up demand with availability, urgency and clear fulfilment information.", "Launch sales, conversion rate", [activity("Launch-day offer", "Sales page / marketplace listing", "Order now", ["Commerce", "Marketplace", "Paid Media"])]),
      stage("RETENTION", "Momentum", "Collect proof and give customers a reason to return or share.", "Reviews, UGC, repeat sales", [activity("Customer proof loop", "UGC request / follow-up", "Share your experience", ["Social Media", "Messaging", "Email"])]),
    ],
  },
  {
    key: "lead-generation",
    name: "Lead Generation Funnel",
    category: "Lead Generation",
    bestFor: ["Professional services", "Consulting", "High-consideration offers"],
    buyingCycle: "Medium",
    description: "Captures qualified interest through a useful lead magnet and nurtures it toward a sales conversation.",
    risks: ["Low-quality lead magnets attract weak leads", "Slow follow-up reduces conversion"],
    stages: [
      stage("TOFU", "Problem Awareness", "Attract people experiencing the problem the service solves.", "Qualified traffic, content engagement", [activity("Problem-led insight", "Post / video / search article", "Learn more", ["Social Media", "Search", "Paid Media"])]),
      stage("MOFU", "Lead Capture", "Exchange useful value for contact information and qualification data.", "Lead conversion rate, CPL", [activity("Lead magnet", "Guide / assessment / checklist", "Download or assess", ["Owned Media", "Paid Media", "Email"])]),
      stage("BOFU", "Sales Conversion", "Nurture, qualify and book the appropriate sales action.", "Booked calls, proposals, win rate", [activity("Consultation sequence", "Email / call booking", "Book a consultation", ["Email", "Messaging", "CRM"])]),
      stage("RETENTION", "Nurture & Referral", "Keep non-ready leads warm and turn customers into referrers.", "Reactivation, referral leads", [activity("Long-term nurture", "Newsletter / case study", "Stay connected", ["Email", "Community"])]),
    ],
  },
  {
    key: "b2b-account-based",
    name: "B2B Account-Based Funnel",
    category: "B2B",
    bestFor: ["Enterprise sales", "Named accounts", "Complex services"],
    buyingCycle: "Long",
    description: "Coordinates research, personalised outreach and stakeholder proof for a defined set of target accounts.",
    risks: ["High research cost", "Poor account selection wastes effort"],
    stages: [
      stage("TOFU", "Account Awareness", "Create relevance inside target accounts and map stakeholders.", "Engaged accounts, stakeholder reach", [activity("Account-specific insight", "Personalised content / ads", "Explore the issue", ["LinkedIn", "Paid Media", "Direct Outreach"])]),
      stage("MOFU", "Stakeholder Engagement", "Build consensus with tailored proof for different decision makers.", "Meetings, engaged stakeholders", [activity("Industry case study", "Workshop / case study", "Discuss the opportunity", ["Email", "Events", "Sales"])]),
      stage("BOFU", "Commercial Decision", "Support validation, procurement and executive approval.", "Pipeline value, proposal acceptance", [activity("Business case and proposal", "ROI model / proposal", "Approve next step", ["Sales", "Email", "Meetings"])]),
      stage("RETENTION", "Expansion", "Prove value and identify additional teams or use cases.", "Renewal, expansion revenue", [activity("Quarterly value review", "Report / executive review", "Expand the programme", ["Customer Success", "Meetings"])]),
    ],
  },
  {
    key: "webinar",
    name: "Webinar / Workshop Funnel",
    category: "Event",
    bestFor: ["Education", "B2B", "Expert-led services"],
    buyingCycle: "Medium",
    description: "Uses a live or recorded educational event to create trust, qualify interest and introduce an offer.",
    risks: ["Registration does not guarantee attendance", "Over-selling reduces trust"],
    stages: [
      stage("TOFU", "Event Discovery", "Promote a specific learning outcome to the right audience.", "Registrations, registration CPA", [activity("Outcome-led event promotion", "Video / post / partner promotion", "Register", ["Social Media", "Paid Media", "Partners"])]),
      stage("MOFU", "Attendance", "Increase show-up rate and prepare attendees for the session.", "Attendance rate, live engagement", [activity("Reminder and pre-event value", "Email / messaging sequence", "Add to calendar", ["Email", "Messaging", "Calendar"])]),
      stage("BOFU", "Offer Follow-up", "Convert engaged attendees into the next commercial step.", "Calls, trials, purchases", [activity("Post-event offer", "Email / consultation page", "Take the next step", ["Email", "Sales", "Owned Media"])]),
      stage("RETENTION", "Replay & Community", "Extend the content lifespan and nurture non-buyers.", "Replay views, community growth", [activity("Replay and resource hub", "Recorded video / community", "Watch or join", ["Video", "Email", "Community"])]),
    ],
  },
  {
    key: "ecommerce-conversion",
    name: "E-commerce Conversion Funnel",
    category: "Commerce",
    bestFor: ["DTC products", "Online stores", "Consumer goods"],
    buyingCycle: "Short",
    description: "Moves product discovery through product proof, checkout and repeat purchase.",
    risks: ["Discount dependence", "Weak product pages create paid-media waste"],
    stages: [
      stage("TOFU", "Product Discovery", "Reach likely buyers with a strong product-use or problem hook.", "Product views, qualified traffic", [activity("Product-in-use creative", "Short video / creator content", "Shop the product", ["Social Media", "Paid Media", "Affiliate"])]),
      stage("MOFU", "Product Evaluation", "Answer product, delivery, trust and comparison questions.", "Add-to-cart, engaged product views", [activity("Benefits, reviews and demonstration", "Product page / carousel", "See details", ["Commerce", "Social Media", "Email"])]),
      stage("BOFU", "Checkout", "Recover intent and reduce checkout friction.", "Purchase rate, cart recovery", [activity("Cart recovery and offer", "Retargeting / email / message", "Complete order", ["Paid Media", "Email", "Messaging"])]),
      stage("RETENTION", "Repeat Purchase", "Increase product usage, replenishment and referral.", "Repeat purchase, LTV", [activity("Usage and replenishment flow", "Email / messaging", "Reorder", ["Email", "Messaging", "Loyalty"])]),
    ],
  },
  {
    key: "marketplace-product",
    name: "Marketplace Product Funnel",
    category: "Marketplace",
    bestFor: ["Shopee", "TikTok Shop", "Marketplace launches"],
    buyingCycle: "Immediate",
    description: "Coordinates off-platform discovery with marketplace listing optimisation, live commerce and retargeting.",
    risks: ["Platform fees and price competition", "Marketplace data may be fragmented"],
    stages: [
      stage("TOFU", "Marketplace Discovery", "Drive qualified attention to a product or store.", "Listing visits, video views", [activity("Product hook", "Creator video / short video", "View product", ["TikTok", "Social Media", "Affiliate"])]),
      stage("MOFU", "Listing Evaluation", "Strengthen reviews, product detail, bundles and live explanation.", "Product engagement, add-to-cart", [activity("Listing proof and live demo", "Listing content / livestream", "Add to cart", ["Marketplace", "Live Commerce"])]),
      stage("BOFU", "Marketplace Conversion", "Use platform vouchers, retargeting and urgency to close.", "Orders, conversion rate, ROAS", [activity("Voucher and retargeting push", "Marketplace ads / live offer", "Buy now", ["Marketplace", "Paid Media"])]),
      stage("RETENTION", "Store Retention", "Encourage reviews, followers, repeat orders and cross-sell.", "Reviews, followers, repeat orders", [activity("Review and cross-sell flow", "Chat / voucher / follow", "Review and follow", ["Marketplace", "Messaging"])]),
    ],
  },
  {
    key: "restaurant-visit",
    name: "Restaurant Visit Funnel",
    category: "Local Business",
    bestFor: ["Restaurants", "Cafes", "Food launches"],
    buyingCycle: "Immediate",
    description: "Turns local food discovery into directions, reservations, visits, reviews and repeat dining.",
    risks: ["Creative demand can exceed outlet capacity", "Location information must be accurate"],
    stages: [
      stage("TOFU", "Local Discovery", "Reach nearby diners with an appetising and distinctive food hook.", "Local reach, video views", [activity("Signature dish reveal", "Food reel / local ad", "Discover the menu", ["Social Media", "Paid Media", "Local Discovery"])]),
      stage("MOFU", "Visit Consideration", "Show menu, price, location, atmosphere and social proof.", "Saves, map views, menu views", [activity("Menu, location and proof", "Carousel / review video", "Save the location", ["Social Media", "Google Business Profile"])]),
      stage("BOFU", "Visit Action", "Make directions, reservation or redemption immediate.", "Directions, calls, redemptions", [activity("Time-bound visit offer", "Story / local ad / message", "Get directions", ["Local Discovery", "Messaging", "Paid Media"])]),
      stage("RETENTION", "Review & Return", "Turn visitors into reviewers and repeat diners.", "Reviews, repeat visits", [activity("Post-visit review and return offer", "QR / WhatsApp", "Review or return", ["Messaging", "Local Discovery", "In-store"])]),
    ],
  },
  {
    key: "local-service",
    name: "Local Service Funnel",
    category: "Local Business",
    bestFor: ["Home services", "Clinics", "Automotive services", "Local professionals"],
    buyingCycle: "Short",
    description: "Captures local search and social demand, qualifies the need and drives calls or bookings.",
    risks: ["Poor response time loses leads", "Service radius must be clear"],
    stages: [
      stage("TOFU", "Local Problem Discovery", "Appear when nearby customers recognise a service need.", "Local impressions, search views", [activity("Problem and service-area content", "Search page / local post", "Check availability", ["Search", "Local Discovery", "Social Media"])]),
      stage("MOFU", "Trust & Qualification", "Show credentials, process, reviews and indicative pricing.", "Calls, quote requests, page depth", [activity("Proof and process", "Review page / explainer", "Request a quote", ["Owned Media", "Local Discovery", "Messaging"])]),
      stage("BOFU", "Booking", "Reduce booking friction and respond quickly.", "Booked jobs, response time", [activity("Booking and follow-up", "Form / call / WhatsApp", "Book now", ["Messaging", "Phone", "Owned Media"])]),
      stage("RETENTION", "Maintenance & Referral", "Create reminders, repeat service and referrals.", "Repeat jobs, referrals", [activity("Service reminder", "Email / message", "Book next service", ["Messaging", "Email"])]),
    ],
  },
  {
    key: "saas-trial",
    name: "SaaS Trial Funnel",
    category: "SaaS",
    bestFor: ["Software", "AI products", "Self-serve SaaS"],
    buyingCycle: "Medium",
    description: "Moves users from problem awareness to trial activation, value realisation and paid conversion.",
    risks: ["Trial sign-ups without activation create false demand", "Onboarding friction reduces conversion"],
    stages: [
      stage("TOFU", "Problem & Category", "Create awareness of the workflow problem and new solution category.", "Qualified visits, demo views", [activity("Problem-solution content", "Demo video / article", "See the workflow", ["Search", "Social Media", "Video"])]),
      stage("MOFU", "Trial Start", "Show product fit and make sign-up credible and low-risk.", "Trial starts, demo bookings", [activity("Use-case proof", "Interactive demo / case study", "Start trial", ["Owned Media", "Email", "Sales"])]),
      stage("BOFU", "Activation & Upgrade", "Drive the user to the first meaningful value and paid plan.", "Activation, paid conversion", [activity("Activation sequence", "In-app / email", "Complete setup", ["Product", "Email", "Messaging"])]),
      stage("RETENTION", "Adoption & Expansion", "Increase repeated use, team adoption and upgrade.", "Retention, expansion MRR", [activity("Adoption programme", "In-app education / success email", "Invite team", ["Product", "Email", "Customer Success"])]),
    ],
  },
  {
    key: "subscription",
    name: "Subscription Funnel",
    category: "Subscription",
    bestFor: ["Membership", "Recurring products", "Paid communities"],
    buyingCycle: "Short",
    description: "Focuses on recurring value, low-friction entry, habit formation and churn prevention.",
    risks: ["Acquisition can hide poor retention", "Unclear recurring value drives churn"],
    stages: [
      stage("TOFU", "Recurring Problem", "Show the repeated need and the value of continuous access.", "Qualified reach, content engagement", [activity("Recurring pain or aspiration", "Video / guide", "Explore membership", ["Social Media", "Owned Media"])]),
      stage("MOFU", "Value Demonstration", "Demonstrate ongoing benefits, community or replenishment value.", "Trial starts, plan comparisons", [activity("Membership value proof", "Preview / testimonials", "See benefits", ["Owned Media", "Email"])]),
      stage("BOFU", "Subscribe", "Make plan choice, guarantee and billing clear.", "Subscription conversion", [activity("Plan and guarantee", "Checkout page", "Subscribe", ["Commerce", "Owned Media"])]),
      stage("RETENTION", "Habit & Save", "Create early value, usage habit and churn intervention.", "Retention, churn, upgrades", [activity("Onboarding and renewal value", "Email / in-product", "Use your benefits", ["Email", "Product", "Community"])]),
    ],
  },
  {
    key: "event-registration",
    name: "Event Registration Funnel",
    category: "Event",
    bestFor: ["Conferences", "Open days", "Launch events", "Community events"],
    buyingCycle: "Short",
    description: "Builds event awareness, drives registration, increases attendance and extends post-event value.",
    risks: ["Registration quality may be low", "Reminder frequency must be balanced"],
    stages: [
      stage("TOFU", "Event Awareness", "Make the event outcome, audience and date immediately clear.", "Reach, event-page visits", [activity("Event outcome announcement", "Video / event post", "View event", ["Social Media", "Partners", "Paid Media"])]),
      stage("MOFU", "Registration", "Use speakers, agenda, proof and scarcity to drive registration.", "Registrations, cost per registration", [activity("Agenda and speaker proof", "Landing page / carousel", "Register", ["Owned Media", "Email", "Paid Media"])]),
      stage("BOFU", "Attendance", "Reduce no-shows with reminders and practical information.", "Attendance rate", [activity("Reminder and logistics", "Email / calendar / WhatsApp", "Add to calendar", ["Email", "Messaging", "Calendar"])]),
      stage("RETENTION", "Post-event Value", "Distribute resources, collect feedback and introduce the next step.", "Feedback, follow-up conversions", [activity("Resources and follow-up", "Email / replay", "Continue learning", ["Email", "Community", "Sales"])]),
    ],
  },
  {
    key: "community-growth",
    name: "Community Growth Funnel",
    category: "Community",
    bestFor: ["Online communities", "Creator communities", "Professional networks"],
    buyingCycle: "Medium",
    description: "Turns useful public participation into membership, contribution, belonging and advocacy.",
    risks: ["Member count can grow without engagement", "Community value needs active facilitation"],
    stages: [
      stage("TOFU", "Public Value", "Create visible conversations and resources relevant to the target community.", "Reach, participation", [activity("Conversation starter", "Thread / live / public resource", "Join the discussion", ["Social Media", "Community"])]),
      stage("MOFU", "Join", "Show member outcomes, norms and reasons to belong.", "Join rate, active members", [activity("Member proof and invitation", "Community page / testimonial", "Join", ["Community", "Email", "Social Media"])]),
      stage("BOFU", "Activate", "Prompt a meaningful first contribution or connection.", "Activation rate, first contribution", [activity("New-member activation", "Welcome flow / challenge", "Introduce yourself", ["Community", "Email"])]),
      stage("RETENTION", "Belong & Advocate", "Recognise contribution and create recurring community rituals.", "Active rate, referrals", [activity("Recognition and referral", "Member spotlight / invite", "Invite a peer", ["Community", "Email"])]),
    ],
  },
  {
    key: "referral",
    name: "Referral Funnel",
    category: "Retention",
    bestFor: ["Satisfied customers", "Professional services", "Consumer brands"],
    buyingCycle: "Short",
    description: "Identifies satisfied customers, asks at the right moment and makes referral easy to complete.",
    risks: ["Asking too early can reduce trust", "Incentives may attract low-fit referrals"],
    stages: [
      stage("TOFU", "Advocate Identification", "Identify customers with positive outcomes or high engagement.", "Eligible advocates", [activity("Satisfaction signal", "Survey / usage trigger", "Share feedback", ["Email", "Messaging", "Product"])]),
      stage("MOFU", "Referral Ask", "Explain who would benefit and why the referral matters.", "Referral participation", [activity("Personal referral request", "Email / message", "Refer someone", ["Email", "Messaging"])]),
      stage("BOFU", "Referral Conversion", "Give the referred person a credible and relevant entry path.", "Qualified referrals, conversions", [activity("Referral landing or introduction", "Landing page / warm intro", "Get started", ["Owned Media", "Sales", "Messaging"])]),
      stage("RETENTION", "Recognition", "Thank, reward and update the advocate appropriately.", "Repeat referrals", [activity("Advocate recognition", "Thank-you / reward", "Refer again", ["Email", "Loyalty"])]),
    ],
  },
  {
    key: "reengagement",
    name: "Re-engagement Funnel",
    category: "Retention",
    bestFor: ["Inactive customers", "Dormant leads", "Lapsed subscribers"],
    buyingCycle: "Short",
    description: "Reconnects with inactive audiences using relevance, changed value and a low-friction return path.",
    risks: ["Over-messaging inactive users", "Discount-only reactivation can reduce margin"],
    stages: [
      stage("TOFU", "Recognition", "Remind the audience of the original need and acknowledge inactivity.", "Open rate, return visits", [activity("Relevant re-introduction", "Email / message", "See what is new", ["Email", "Messaging"])]),
      stage("MOFU", "New Value", "Show meaningful updates, new proof or a better-fit use case.", "Engaged returners", [activity("What changed", "Update summary / case study", "Explore updates", ["Email", "Owned Media"])]),
      stage("BOFU", "Return Action", "Offer a simple next action based on prior relationship.", "Reactivation conversion", [activity("Return offer or consultation", "Offer / booking", "Come back", ["Email", "Messaging", "Commerce"])]),
      stage("RETENTION", "Preference Reset", "Capture preferences and avoid repeating irrelevant outreach.", "Retained reactivated users", [activity("Preference and value reset", "Preference centre / onboarding", "Choose updates", ["Email", "Product"])]),
    ],
  },
  {
    key: "high-ticket-consultation",
    name: "High-Ticket Consultation Funnel",
    category: "Services",
    bestFor: ["Agency retainers", "Consulting", "Custom software", "Premium services"],
    buyingCycle: "Long",
    description: "Builds expertise and fit before a diagnostic call, proposal and decision process.",
    risks: ["Unqualified calls waste delivery time", "Generic proposals weaken confidence"],
    stages: [
      stage("TOFU", "Expertise", "Demonstrate insight into the buyer's costly problem.", "Qualified engagement, target visits", [activity("Expert point of view", "Article / video / talk", "Understand the issue", ["LinkedIn", "Search", "Events"])]),
      stage("MOFU", "Diagnosis", "Help the prospect assess fit, urgency and expected value.", "Assessments, qualified calls", [activity("Diagnostic assessment", "Assessment / workshop", "Assess your situation", ["Owned Media", "Email", "Sales"])]),
      stage("BOFU", "Proposal & Decision", "Present a tailored commercial plan, risk controls and outcomes.", "Proposal acceptance, sales cycle", [activity("Tailored business case", "Proposal / presentation", "Approve engagement", ["Sales", "Meetings", "Email"])]),
      stage("RETENTION", "Value Realisation", "Report outcomes and create the next strategic opportunity.", "Renewal, expansion, referrals", [activity("Executive value review", "Report / review meeting", "Plan next phase", ["Customer Success", "Meetings"])]),
    ],
  },
  {
    key: "app-install-onboarding",
    name: "App Install & Onboarding Funnel",
    category: "Mobile App",
    bestFor: ["Mobile apps", "PWA", "Consumer utilities"],
    buyingCycle: "Short",
    description: "Connects acquisition, install, first-value onboarding and recurring use.",
    risks: ["Optimising installs without activation", "Permission prompts can cause drop-off"],
    stages: [
      stage("TOFU", "App Discovery", "Show the single most valuable job the app completes.", "Store visits, install intent", [activity("Job-to-be-done demonstration", "Short demo", "Try the app", ["Social Media", "Paid Media", "Search"])]),
      stage("MOFU", "Install", "Build trust with proof, screenshots and clear privacy expectations.", "Install rate", [activity("Store-page proof", "App listing / review content", "Install", ["App Store", "Owned Media"])]),
      stage("BOFU", "Activation", "Guide the user to first value with minimal setup.", "Activation rate, time to value", [activity("First-value onboarding", "In-app checklist", "Complete setup", ["Product", "Email"])]),
      stage("RETENTION", "Habit", "Create useful reminders and recurring value moments.", "DAU/MAU, retention", [activity("Habit loop", "Push / email / in-app", "Return to task", ["Product", "Push", "Email"])]),
    ],
  },
  {
    key: "nonprofit-donation",
    name: "Donation / Cause Funnel",
    category: "Nonprofit",
    bestFor: ["Charities", "Community causes", "Fundraising campaigns"],
    buyingCycle: "Short",
    description: "Connects cause awareness with trust, donation action and transparent impact reporting.",
    risks: ["Emotional messaging without evidence reduces trust", "Donation friction can be high"],
    stages: [
      stage("TOFU", "Cause Awareness", "Make the problem human, specific and understandable.", "Reach, story engagement", [activity("Impact story", "Video / story", "Learn about the cause", ["Social Media", "Partners", "PR"])]),
      stage("MOFU", "Trust", "Show governance, use of funds and credible progress.", "Donation-page views, trust signals", [activity("Transparency and proof", "Impact page / report", "See the impact", ["Owned Media", "Email"])]),
      stage("BOFU", "Donate", "Offer clear amounts, payment options and immediate confirmation.", "Donation conversion, average gift", [activity("Donation appeal", "Donation page", "Donate now", ["Owned Media", "Messaging", "Events"])]),
      stage("RETENTION", "Impact & Advocacy", "Report outcomes and invite continued support or sharing.", "Repeat donations, shares", [activity("Donor impact update", "Email / report", "Continue supporting", ["Email", "Community"])]),
    ],
  },
  {
    key: "education-enrolment",
    name: "Education Enrolment Funnel",
    category: "Education",
    bestFor: ["Courses", "Schools", "Training programmes"],
    buyingCycle: "Medium",
    description: "Moves learners or parents from programme discovery through fit, consultation and enrolment.",
    risks: ["Programme claims must be supportable", "Application complexity causes abandonment"],
    stages: [
      stage("TOFU", "Learning Need", "Connect the programme to a learner goal or gap.", "Qualified traffic, content engagement", [activity("Learning outcome content", "Video / guide / talk", "Explore programme", ["Social Media", "Search", "Events"])]),
      stage("MOFU", "Programme Fit", "Explain curriculum, outcomes, schedule, instructors and proof.", "Open-day registrations, enquiries", [activity("Curriculum and student proof", "Webinar / brochure / testimonial", "Attend briefing", ["Owned Media", "Email", "Events"])]),
      stage("BOFU", "Application & Enrolment", "Support financing, application and final decision.", "Applications, enrolments", [activity("Application support", "Consultation / application flow", "Apply now", ["Owned Media", "Messaging", "Sales"])]),
      stage("RETENTION", "Learner Success", "Onboard the learner and support completion and referrals.", "Attendance, completion, referral", [activity("Learner onboarding", "Email / community / portal", "Start learning", ["Email", "Community", "Product"])]),
    ],
  },
  {
    key: "property-enquiry",
    name: "Property Enquiry Funnel",
    category: "Property",
    bestFor: ["Property launches", "Real estate", "High-consideration assets"],
    buyingCycle: "Long",
    description: "Builds project discovery, qualification, viewing and sales follow-up for property decisions.",
    risks: ["Lead quality varies widely", "Claims and pricing must stay current"],
    stages: [
      stage("TOFU", "Project Discovery", "Reach likely buyers with location, lifestyle or investment relevance.", "Qualified reach, project views", [activity("Location or lifestyle hook", "Video / portal listing", "Explore project", ["Paid Media", "Property Portal", "Social Media"])]),
      stage("MOFU", "Qualification", "Provide unit, pricing, financing, progress and developer proof.", "Brochure downloads, qualified leads", [activity("Project information pack", "Brochure / virtual tour", "Request details", ["Owned Media", "Messaging", "Portal"])]),
      stage("BOFU", "Viewing & Booking", "Coordinate viewing, objection handling and booking action.", "Viewings, bookings", [activity("Viewing sequence", "Call / WhatsApp / appointment", "Book viewing", ["Messaging", "Sales", "Calendar"])]),
      stage("RETENTION", "Buyer Communication", "Maintain confidence through documentation and progress updates.", "Booking retention, referrals", [activity("Buyer progress update", "Email / portal / event", "Track progress", ["Email", "Messaging", "Events"])]),
    ],
  },
];

export function playbookByKey(key?: string | null) {
  return FUNNEL_PLAYBOOKS.find((playbook) => playbook.key === key);
}
