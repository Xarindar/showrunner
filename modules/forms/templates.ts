import { FormDestination, FormFieldRole, FormFieldType } from "@prisma/client";

export type FormTemplateField = {
  label: string;
  type: FormFieldType;
  fieldRole?: FormFieldRole;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  isRequired?: boolean;
  isHidden?: boolean;
};

export type FormTemplate = {
  key: string;
  name: string;
  category: string;
  description: string;
  destination: FormDestination;
  submitButtonLabel: string;
  successMessage: string;
  fields: FormTemplateField[];
};

export const formTemplates: FormTemplate[] = [
  {
    key: "contact-inquiry",
    name: "Contact inquiry",
    category: "Lead capture",
    description: "General website inquiry with contact details and message context.",
    destination: FormDestination.INQUIRY,
    submitButtonLabel: "Send inquiry",
    successMessage: "Thanks. We received your inquiry and will follow up soon.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Phone", type: FormFieldType.PHONE },
      { label: "What can we help with?", type: FormFieldType.TEXTAREA, isRequired: true },
      { label: "Preferred contact method", type: FormFieldType.SELECT, options: ["Email", "Phone", "Text"] }
    ]
  },
  {
    key: "booking-intake",
    name: "Booking intake",
    category: "Intake",
    description: "Pre-session intake for goals, timing, location, and planning notes.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Submit intake",
    successMessage: "Thanks. Your intake details were received.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Session date", type: FormFieldType.DATE },
      { label: "Session location", type: FormFieldType.TEXT },
      { label: "Main goals", type: FormFieldType.TEXTAREA, isRequired: true },
      { label: "Important notes", type: FormFieldType.TEXTAREA }
    ]
  },
  {
    key: "lead-capture",
    name: "Lead capture",
    category: "Lead capture",
    description: "Short conversion form for campaign pages and lightweight inquiries.",
    destination: FormDestination.INQUIRY,
    submitButtonLabel: "Request details",
    successMessage: "Thanks. We will send details shortly.",
    fields: [
      { label: "Name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Interested in", type: FormFieldType.SELECT, options: ["Portraits", "Wedding", "Event", "Products", "Other"], isRequired: true },
      { label: "Timeline", type: FormFieldType.SELECT, options: ["ASAP", "This month", "1-3 months", "Just researching"] }
    ]
  },
  {
    key: "photo-session-questionnaire",
    name: "Photo session questionnaire",
    category: "Questionnaire",
    description: "Creative direction, shot list, usage, wardrobe, and delivery notes.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Send questionnaire",
    successMessage: "Thanks. Your session questionnaire was submitted.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Session type", type: FormFieldType.SELECT, options: ["Portrait", "Family", "Brand", "Event", "Product"], isRequired: true },
      { label: "Must-have shots", type: FormFieldType.TEXTAREA, isRequired: true },
      { label: "Style references", type: FormFieldType.TEXTAREA },
      { label: "Wardrobe or prop notes", type: FormFieldType.TEXTAREA },
      { label: "Final image usage", type: FormFieldType.TEXTAREA }
    ]
  },
  {
    key: "venue-inquiry",
    name: "Venue inquiry",
    category: "Inquiry",
    description: "Event or venue request with date, guest count, and logistics.",
    destination: FormDestination.INQUIRY,
    submitButtonLabel: "Send venue inquiry",
    successMessage: "Thanks. We received your venue inquiry.",
    fields: [
      { label: "Contact name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Event date", type: FormFieldType.DATE, isRequired: true },
      { label: "Guest count", type: FormFieldType.TEXT },
      { label: "Venue or location", type: FormFieldType.TEXT },
      { label: "Event details", type: FormFieldType.TEXTAREA, isRequired: true }
    ]
  },
  {
    key: "product-customization",
    name: "Product customization",
    category: "Orders",
    description: "Collect personalization, sizing, finish, and delivery preferences.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Send customization",
    successMessage: "Thanks. Your customization notes were received.",
    fields: [
      { label: "Name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Product or order reference", type: FormFieldType.TEXT, isRequired: true },
      { label: "Customization details", type: FormFieldType.TEXTAREA, isRequired: true },
      { label: "Size or format", type: FormFieldType.TEXT },
      { label: "Delivery deadline", type: FormFieldType.DATE }
    ]
  },
  {
    key: "waiver-acknowledgement",
    name: "Waiver acknowledgement",
    category: "Acknowledgement",
    description: "Typed-name acknowledgement for a waiver or participation policy.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Acknowledge waiver",
    successMessage: "Thanks. Your acknowledgement was submitted.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Policy or waiver version", type: FormFieldType.HIDDEN, placeholder: "waiver-v1", isHidden: true },
      { label: "I have read and agree to the waiver terms", type: FormFieldType.CHECKBOX, isRequired: true },
      { label: "Typed name", type: FormFieldType.SIGNATURE, isRequired: true },
      { label: "Questions or exceptions", type: FormFieldType.TEXTAREA }
    ]
  },
  {
    key: "model-release",
    name: "Model release acknowledgement",
    category: "Acknowledgement",
    description: "Permission and usage acknowledgement with typed-name capture.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Submit release",
    successMessage: "Thanks. Your release acknowledgement was submitted.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Usage permission", type: FormFieldType.RADIO, options: ["Portfolio and website", "Social media", "Internal use only"], isRequired: true },
      { label: "Minor participant name", type: FormFieldType.TEXT },
      { label: "Guardian name if applicable", type: FormFieldType.TEXT },
      { label: "Typed name", type: FormFieldType.SIGNATURE, isRequired: true }
    ]
  },
  {
    key: "agreement-acknowledgement",
    name: "Agreement acknowledgement",
    category: "Acknowledgement",
    description: "Lightweight typed-name acknowledgement for a prepared agreement.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Submit acknowledgement",
    successMessage: "Thanks. Your acknowledgement was submitted.",
    fields: [
      { label: "Full name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Agreement reference", type: FormFieldType.TEXT, isRequired: true },
      { label: "I acknowledge the prepared agreement terms", type: FormFieldType.CHECKBOX, isRequired: true },
      { label: "Typed name", type: FormFieldType.SIGNATURE, isRequired: true },
      { label: "Notes", type: FormFieldType.TEXTAREA }
    ]
  },
  {
    key: "testimonial-request",
    name: "Testimonial request",
    category: "Feedback",
    description: "Client feedback and review request with publication permission.",
    destination: FormDestination.CLIENT,
    submitButtonLabel: "Send feedback",
    successMessage: "Thanks. Your feedback was submitted.",
    fields: [
      { label: "Name", type: FormFieldType.TEXT, fieldRole: FormFieldRole.SUBMITTER_NAME, isRequired: true },
      { label: "Email", type: FormFieldType.EMAIL, fieldRole: FormFieldRole.SUBMITTER_EMAIL, isRequired: true },
      { label: "Rating", type: FormFieldType.RADIO, options: ["5", "4", "3", "2", "1"], isRequired: true },
      { label: "Testimonial", type: FormFieldType.TEXTAREA, isRequired: true },
      { label: "May we publish this feedback?", type: FormFieldType.CHECKBOX },
      { label: "Preferred display name", type: FormFieldType.TEXT }
    ]
  }
];

export function findFormTemplate(key: string) {
  return formTemplates.find((template) => template.key === key);
}
