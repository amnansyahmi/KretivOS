export type IndustryGroup = {
  label: string;
  options: string[];
};

/**
 * Shared KretivOS industry taxonomy.
 *
 * Keep labels stable because they are used by CRM filters, funnel suggestions,
 * Brand DNA, reporting and future analytics. A custom option remains available
 * for niche businesses that do not fit the maintained taxonomy.
 */
export const INDUSTRY_GROUPS: IndustryGroup[] = [
  {
    label: "Agriculture & Natural Resources",
    options: [
      "Agriculture & Farming",
      "Aquaculture & Fisheries",
      "Forestry & Timber",
      "Livestock & Poultry",
      "Mining & Quarrying",
      "Plantation",
      "Agricultural Technology",
      "Natural Resources"
    ]
  },
  {
    label: "Food, Beverage & Hospitality",
    options: [
      "Food & Beverage",
      "Restaurant & Cafe",
      "Food Manufacturing",
      "Food Distribution & Wholesale",
      "Bakery & Confectionery",
      "Catering",
      "Cloud Kitchen",
      "Grocery & Supermarket",
      "Hotel & Accommodation",
      "Hospitality",
      "Event Venue",
      "Food Technology"
    ]
  },
  {
    label: "Retail, Commerce & Consumer Goods",
    options: [
      "Retail",
      "E-commerce",
      "Marketplace",
      "Consumer Goods",
      "Wholesale & Distribution",
      "Convenience Store",
      "Department Store",
      "Direct-to-Consumer Brand",
      "Import & Export",
      "Luxury Goods",
      "Office Supplies",
      "Pet Products & Services"
    ]
  },
  {
    label: "Fashion, Beauty & Lifestyle",
    options: [
      "Fashion & Apparel",
      "Beauty & Cosmetics",
      "Personal Care",
      "Jewellery & Accessories",
      "Footwear",
      "Textiles",
      "Salon & Spa",
      "Fitness & Wellness",
      "Lifestyle Brand",
      "Sportswear"
    ]
  },
  {
    label: "Manufacturing & Industrial",
    options: [
      "Manufacturing",
      "Electronics Manufacturing",
      "Electrical Equipment",
      "Machinery & Equipment",
      "Industrial Automation",
      "Chemical Manufacturing",
      "Plastics & Rubber",
      "Metal & Steel",
      "Packaging",
      "Printing",
      "Semiconductor",
      "Aerospace Manufacturing",
      "Medical Device Manufacturing",
      "Furniture Manufacturing",
      "Building Materials"
    ]
  },
  {
    label: "Construction, Property & Facilities",
    options: [
      "Construction",
      "Property Development",
      "Real Estate",
      "Architecture",
      "Interior Design",
      "Engineering Consultancy",
      "Facilities Management",
      "Property Management",
      "Quantity Surveying",
      "Home Renovation",
      "Landscaping",
      "Building Maintenance"
    ]
  },
  {
    label: "Automotive, Transport & Logistics",
    options: [
      "Automotive",
      "Automotive Dealership",
      "Automotive Parts & Services",
      "Transportation",
      "Logistics & Supply Chain",
      "Courier & Delivery",
      "Freight & Shipping",
      "Warehousing",
      "Public Transport",
      "Aviation",
      "Maritime",
      "Mobility Technology",
      "Car Rental",
      "Fleet Management"
    ]
  },
  {
    label: "Energy, Utilities & Environment",
    options: [
      "Energy",
      "Oil & Gas",
      "Renewable Energy",
      "Utilities",
      "Water & Wastewater",
      "Waste Management & Recycling",
      "Environmental Services",
      "Sustainability & ESG",
      "Solar Energy",
      "Power Generation"
    ]
  },
  {
    label: "Technology & Digital",
    options: [
      "Technology",
      "Software & SaaS",
      "Artificial Intelligence",
      "Information Technology Services",
      "Cybersecurity",
      "Cloud Computing",
      "Data & Analytics",
      "Fintech",
      "Healthtech",
      "Edtech",
      "Proptech",
      "E-commerce Technology",
      "Web3 & Blockchain",
      "Gaming & Esports",
      "Hardware & Devices",
      "Internet of Things",
      "Robotics",
      "Research & Development"
    ]
  },
  {
    label: "Telecommunications, Media & Creative",
    options: [
      "Telecommunications",
      "Media & Publishing",
      "Advertising & Marketing",
      "Creative Agency",
      "Public Relations",
      "Film & Video Production",
      "Photography",
      "Music & Audio",
      "Broadcasting",
      "Content Creator & Influencer",
      "Graphic Design",
      "Animation",
      "Events & Experiential Marketing"
    ]
  },
  {
    label: "Professional & Business Services",
    options: [
      "Professional Services",
      "Business Consulting",
      "Management Consulting",
      "Legal Services",
      "Accounting & Audit",
      "Tax Services",
      "Human Resources & Recruitment",
      "Training & Coaching",
      "Outsourcing & BPO",
      "Market Research",
      "Translation & Language Services",
      "Security Services",
      "Cleaning Services",
      "Corporate Secretarial Services"
    ]
  },
  {
    label: "Banking, Finance & Insurance",
    options: [
      "Banking",
      "Financial Services",
      "Insurance",
      "Investment & Asset Management",
      "Payments",
      "Lending & Credit",
      "Accounting Technology",
      "Wealth Management",
      "Islamic Finance",
      "Cooperative & Credit Union"
    ]
  },
  {
    label: "Healthcare & Life Sciences",
    options: [
      "Healthcare",
      "Hospital & Medical Centre",
      "Clinic",
      "Dental",
      "Pharmaceutical",
      "Biotechnology",
      "Medical Devices",
      "Diagnostics & Laboratory",
      "Mental Health",
      "Elderly Care",
      "Home Healthcare",
      "Veterinary",
      "Nutrition & Supplements",
      "Rehabilitation & Physiotherapy"
    ]
  },
  {
    label: "Education & Knowledge",
    options: [
      "Education",
      "School",
      "University & Higher Education",
      "Preschool & Childcare",
      "Tuition & Learning Centre",
      "Vocational & Skills Training",
      "Corporate Training",
      "Online Learning",
      "Research Institute",
      "Library & Knowledge Services"
    ]
  },
  {
    label: "Government, Public Sector & Community",
    options: [
      "Government / Public Sector",
      "Local Authority",
      "Government-Linked Company",
      "Statutory Body",
      "Public Infrastructure",
      "Public Safety & Emergency Services",
      "Defence",
      "Nonprofit & NGO",
      "Charity",
      "Religious Organisation",
      "Community Organisation",
      "Trade Association & Chamber"
    ]
  },
  {
    label: "Travel, Leisure, Arts & Sports",
    options: [
      "Travel & Tourism",
      "Travel Agency",
      "Attractions & Theme Parks",
      "Arts & Culture",
      "Museum & Gallery",
      "Entertainment",
      "Sports & Recreation",
      "Sports Club & Association",
      "Wedding & Events",
      "Outdoor & Adventure",
      "Amusement & Family Entertainment"
    ]
  },
  {
    label: "Home, Family & Personal Services",
    options: [
      "Home Services",
      "Childcare & Family Services",
      "Senior & Disability Services",
      "Laundry & Dry Cleaning",
      "Repair & Maintenance",
      "Funeral Services",
      "Personal Concierge",
      "Moving & Relocation",
      "Pest Control",
      "Domestic Services"
    ]
  }
];

export const INDUSTRIES = INDUSTRY_GROUPS.flatMap((group) => group.options);

export const CUSTOM_INDUSTRY_OPTION = "Other / Custom Industry";
