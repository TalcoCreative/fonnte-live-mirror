export type StepType =
  | "message"
  | "closing"
  | "input_text"
  | "textarea"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "date"
  | "phone"
  | "email"
  | "number"
  | "file"
  | "conditional";

export const STEP_META: Record<StepType, { label: string; mappable: boolean; hasOptions: boolean; hasPrompt: boolean }> = {
  message:     { label: "Pesan Bot",       mappable: false, hasOptions: false, hasPrompt: true  },
  closing:     { label: "Pesan Penutup",   mappable: false, hasOptions: false, hasPrompt: true  },
  input_text:  { label: "Input Teks",      mappable: true,  hasOptions: false, hasPrompt: true  },
  textarea:    { label: "Textarea",        mappable: true,  hasOptions: false, hasPrompt: true  },
  dropdown:    { label: "Dropdown",        mappable: true,  hasOptions: true,  hasPrompt: true  },
  radio:       { label: "Radio",           mappable: true,  hasOptions: true,  hasPrompt: true  },
  checkbox:    { label: "Checkbox (multi)",mappable: true,  hasOptions: true,  hasPrompt: true  },
  date:        { label: "Tanggal",         mappable: true,  hasOptions: false, hasPrompt: true  },
  phone:       { label: "Nomor Telepon",   mappable: true,  hasOptions: false, hasPrompt: true  },
  email:       { label: "Email",           mappable: true,  hasOptions: false, hasPrompt: true  },
  number:      { label: "Angka",           mappable: true,  hasOptions: false, hasPrompt: true  },
  file:        { label: "Upload File",     mappable: true,  hasOptions: false, hasPrompt: true  },
  conditional: { label: "Conditional",     mappable: false, hasOptions: false, hasPrompt: false },
};

export const MAPPING_FIELDS: { value: string; label: string }[] = [
  { value: "",                              label: "— Tidak disimpan —" },
  { value: "contacts.full_name",            label: "Nama Lengkap" },
  { value: "contacts.email",                label: "Email" },
  { value: "contacts.domicile",             label: "Domisili" },
  { value: "contacts.age",                  label: "Usia" },
  { value: "contacts.chief_complaint",      label: "Keluhan Utama" },
  { value: "contacts.need_category",        label: "Kategori Kebutuhan" },
  { value: "contacts.description",          label: "Deskripsi / Pertanyaan" },
  { value: "contacts.notes",                label: "Catatan" },
  { value: "contacts.current_medications",  label: "Obat Sedang Dikonsumsi" },
  { value: "contacts.document_url",         label: "URL Dokumen" },
  { value: "contacts.interested_product_id",label: "Produk (pilih dari katalog)" },
];
