import { z } from 'zod';

const LawFirmApprovalSchema = z.enum(['Approved', 'Hold']);
const ClaimantTypeSchema = z.enum(['Adult', 'Minor', 'Incapacitated Adult', 'Decedent', 'Alternate', 'Municipality']);
const YesNoSchema = z.enum(['Y', 'N']);
const BankruptcyClearedSchema = z.enum(['Cleared to Trustee', 'Cleared to Claimant', 'Cleared-Split', 'Non applicable']);
const GenderIdentitySchema = z.enum(['Male', 'Female', 'Nonbinary', 'Not Listed']);
const PronounsSchema = z.enum(['He/Him', 'She/Her', 'They/Them', 'He/They', 'She/They', 'Not Listed']);
const AltClaimantTypeSchema = z.enum(['Personal Representative (POA)', 'Trustee', 'Estate Representative', 'Heir', 'Other']);
const AttorneyFeeCalcMethodSchema = z.enum(['Gross', 'Net Cost']);
const LienTypeSchema = z.enum(['Medicare', 'Medicaid', 'Private-PLRP', 'Private-Non-PLRP', 'Military/HIS', 'Other (medical)']);

// Complete Demographics Schema based on your field specification
export const DemographicsSchema = z.object({
  id: z.string().uuid(),
  partitionKey: z.string(),
  
  // Basic Information
  law_firm: z.string().max(55),
  law_firm_approval: LawFirmApprovalSchema.optional(),
  firstname: z.string().max(55).optional(),
  lastname: z.string().max(75).optional(),
  email: z.string().email(),
  phone: z.string().min(10).max(11),
  sf_id: z.string().max(50).optional(),
  ml_id: z.string().max(50).optional(),
  law_firm_client_id: z.string().max(50).optional(),
  otherid: z.string().max(50).optional(),
  primarylawfirm: z.string().max(75),
  ethnicity: z.string().max(11),
  claimanttype: ClaimantTypeSchema,
  
  // Legal Status
  liensfinal: YesNoSchema.optional(),
  bankruptcy: YesNoSchema.optional(),
  bankruptcycleared: BankruptcyClearedSchema.optional(),
  probate: YesNoSchema.optional(),
  probatecleared: YesNoSchema.optional(),
  pathway_opt_in_status: YesNoSchema.optional(),
  dod: z.string().datetime().optional(),
  
  // Service Information
  serviceoptions: z.string().max(75).optional(),
  disbursementcount: z.string().max(35).optional(),
  milestonedisbursementid: z.string().max(50).optional(),
  paygroupid: z.string().max(50).optional(),
  
  // Personal Information
  honorific: z.string().max(10).optional(),
  genderidentity: GenderIdentitySchema.optional(),
  pronouns: PronounsSchema.optional(),
  
  // Address Information
  address1: z.string().max(75).optional(),
  address2: z.string().max(75).optional(),
  careof: z.string().max(75).optional(),
  city: z.string().max(55).optional(),
  state: z.string().max(2).optional(),
  region: z.string().max(50).optional(),
  zipcode: z.string().max(25).optional(),
  country: z.string().max(55).optional(),
  
  // Personal Details
  dob: z.string().datetime().optional(),
  ssn: z.string().max(11).optional(),
  
  // Contact Information
  claimantpersonalemail: z.string().email().max(75).optional(),
  claimantbusinessemail: z.string().email().max(75).optional(),
  claimantotheremail: z.string().email().max(75).optional(),
  claimantmobilephone: z.string().max(20).optional(),
  claimanthomephone: z.string().max(20).optional(),
  sms_opt_in: YesNoSchema.optional(),
  
  // Alternate Claimant Information
  altclaimanttype: AltClaimantTypeSchema.optional(),
  alternateclaimantsf_id: z.string().max(50).optional(),
  alternateclaimantml_id: z.string().max(50).optional(),
  alternateclaimantdob: z.string().max(10).optional(),
  alternateclaimantssn: z.string().max(11).optional(),
  alternateclaimantfirstname: z.string().max(55).optional(),
  alternateclaimantlastname: z.string().max(75).optional(),
  alternateclaimanthonorific: z.string().max(10).optional(),
  alternateclaimantaddress1: z.string().max(75).optional(),
  alternateclaimantaddress2: z.string().max(75).optional(),
  alternateclaimantcity: z.string().max(55).optional(),
  alternateclaimantstate: z.string().max(2).optional(),
  alternateclaimantregion: z.string().max(50).optional(),
  alternateclaimantzipcode: z.string().max(25).optional(),
  alternateclaimantcountry: z.string().max(55).optional(),
  alternateclaimantpersonalemail: z.string().email().max(75).optional(),
  alternateclaimantpersonalphonenumber: z.string().max(20).optional(),
  
  // Financial Information
  basegrossaward: z.number().max(9999999999.9999).optional(),
  eifawardamount: z.number().max(9999999999.9999).optional(),
  appealaward: z.number().max(9999999999.9999).optional(),
  totalgrossaward: z.number().max(9999999999.9999).optional(),
  commonbenefit: z.number().max(1.0).optional(),
  commonbenefittotal: z.number().max(9999999999.9999).optional(),
  commonbenefitattorneyshare: z.number().max(1.0).optional(),
  commonbenefitattorneyshareamount: z.number().max(9999999999.9999).optional(),
  commonbenefitclaimantshare: z.number().max(1.0).optional(),
  commonbenefitclaimantshareamount: z.number().max(9999999999.9999).optional(),
  
  // Attorney Fee Information
  attorneyfeecalcmethod: AttorneyFeeCalcMethodSchema.optional(),
  grosscontingencyfeeperc: z.number().max(1.0).optional(),
  grosscontingencyfeeamount: z.number().max(9999999999.9999).optional(),
  grossattorneyfeeperc: z.number().max(1.0).optional(),
  grossattorneyfeeamount: z.number().max(9999999999.9999).optional(),
  attorneyfeereduction: z.number().max(9999999999.9999).optional(),
  attorneycostreduction: z.number().max(9999999999.9999).optional(),
  attorneyfeeholdbackamount: z.number().max(9999999999.9999).optional(),
  totalnetattorneyfee: z.number().max(9999999999.9999).optional(),
  totalnetattorneycost: z.number().max(9999999999.9999).optional(),
  totaladmincost: z.number().max(9999999999.9999).optional(),
  othertotalliens: z.number().max(9999999999.9999).optional(),
  holdbackamount: z.number().max(9999999999.9999).optional(),
  otherholdbackamount: z.number().max(9999999999.9999).optional(),
  totalmedicalliens: z.number().max(9999999999.9999).optional(),
  previouspaymentstoclaimant: z.number().max(9999999999.9999).optional(),
  netclaimantpayment: z.number().max(9999999999.9999).optional(),
  generalcaseexpenses: z.number().max(9999999999.9999).optional(),
  
  // Attorney Information (up to 10 attorneys)
  attorney1name: z.string().max(75).optional(),
  attorney1feepercent: z.number().max(1.0).optional(),
  attorney1fees: z.number().max(9999999999.9999).optional(),
  attorney1costamount: z.number().max(9999999999.9999).optional(),
  attorney2name: z.string().max(75).optional(),
  attorney2feepercent: z.number().max(1.0).optional(),
  attorney2fees: z.number().max(9999999999.9999).optional(),
  attorney2costamount: z.number().max(9999999999.9999).optional(),
  attorney3name: z.string().max(75).optional(),
  attorney3feepercent: z.number().max(1.0).optional(),
  attorney3fees: z.number().max(9999999999.9999).optional(),
  attorney3costamount: z.number().max(9999999999.9999).optional(),
  attorney4name: z.string().max(75).optional(),
  attorney4feepercent: z.number().max(1.0).optional(),
  attorney4fees: z.number().max(9999999999.9999).optional(),
  attorney4costamount: z.number().max(9999999999.9999).optional(),
  attorney5name: z.string().max(75).optional(),
  attorney5feepercent: z.number().max(1.0).optional(),
  attorney5fees: z.number().max(9999999999.9999).optional(),
  attorney5costamount: z.number().max(9999999999.9999).optional(),
  attorney6name: z.string().max(75).optional(),
  attorney6feepercent: z.number().max(1.0).optional(),
  attorney6fees: z.number().max(9999999999.9999).optional(),
  attorney6costamount: z.number().max(9999999999.9999).optional(),
  attorney7name: z.string().max(75).optional(),
  attorney7feepercent: z.number().max(1.0).optional(),
  attorney7fees: z.number().max(9999999999.9999).optional(),
  attorney7costamount: z.number().max(9999999999.9999).optional(),
  attorney8name: z.string().max(75).optional(),
  attorney8feepercent: z.number().max(1.0).optional(),
  attorney8fees: z.number().max(9999999999.9999).optional(),
  attorney8costamount: z.number().max(9999999999.9999).optional(),
  attorney9name: z.string().max(75).optional(),
  attorney9feepercent: z.number().max(1.0).optional(),
  attorney9fees: z.number().max(9999999999.9999).optional(),
  attorney9costamount: z.number().max(9999999999.9999).optional(),
  attorney10name: z.string().max(75).optional(),
  attorney10feepercent: z.number().max(1.0).optional(),
  attorney10fees: z.number().max(9999999999.9999).optional(),
  attorney10costamount: z.number().max(9999999999.9999).optional(),
  
  // Vendor Expenses
  vendorexpenseqsfadmin: z.number().max(9999999999.9999).optional(),
  vendorexpenseqsfadminname: z.string().max(55).optional(),
  vendorexpenseclaimsadmin: z.number().max(9999999999.9999).optional(),
  vendorexpenseclaimsadminname: z.string().max(55).optional(),
  vendorexpenselraholdback: z.number().max(9999999999.9999).optional(),
  vendorexpenselraholdbackname: z.string().max(55).optional(),
  vendorexpenselrafinal: z.number().max(9999999999.9999).optional(),
  vendorexpenselrafinalname: z.string().max(55).optional(),
  vendorexpensespecialmaster: z.number().max(9999999999.9999).optional(),
  vendorexpensespecialmastername: z.string().max(55).optional(),
  vendorexpenseeifappeal: z.number().max(9999999999.9999).optional(),
  vendorexpenseeifappealname: z.string().max(55).optional(),
  vendorexpensebankruptcycounsel: z.number().max(9999999999.9999).optional(),
  vendorexpensebankruptcycounselname: z.string().max(55).optional(),
  vendorexpenseprobatecounsel: z.number().max(9999999999.9999).optional(),
  vendorexpenseprobatecounselname: z.string().max(55).optional(),
  vendorother: z.number().max(9999999999.9999).optional(),
  vendorothername: z.string().max(55).optional(),
  
  // Medical Liens (up to 6)
  medicallien1name: z.string().max(55).optional(),
  lienid1: z.string().max(55).optional(),
  lientype1: LienTypeSchema.optional(),
  medicallien1: z.number().max(9999999999.9999).optional(),
  medicallien2name: z.string().max(55).optional(),
  lienid2: z.string().max(55).optional(),
  lientype2: LienTypeSchema.optional(),
  medicallien2: z.number().max(9999999999.9999).optional(),
  medicallien3name: z.string().max(55).optional(),
  lienid3: z.string().max(55).optional(),
  lientype3: LienTypeSchema.optional(),
  medicallien3: z.number().max(9999999999.9999).optional(),
  medicallien4name: z.string().max(55).optional(),
  lienid4: z.string().max(55).optional(),
  lientype4: LienTypeSchema.optional(),
  medicallien4: z.number().max(9999999999.9999).optional(),
  medicallien5name: z.string().max(55).optional(),
  lienid5: z.string().max(55).optional(),
  lientype5: LienTypeSchema.optional(),
  medicallien5: z.number().max(9999999999.9999).optional(),
  medicallien6name: z.string().max(55).optional(),
  lienid6: z.string().max(55).optional(),
  lientype6: LienTypeSchema.optional(),
  medicallien6: z.number().max(9999999999.9999).optional(),
  
  // Other Liens
  otherlien1name: z.string().max(55).optional(),
  otherlien1amount: z.number().max(9999999999.9999).optional(),
  otherlien2name: z.string().max(55).optional(),
  otherlien2amount: z.number().max(9999999999.9999).optional(),
  
  // Attorney Cost Details
  attorney1name_cost: z.string().max(75).optional(),
  attorney1_costdetailname: z.string().max(128).optional(),
  attorney1_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney2name_cost: z.string().max(75).optional(),
  attorney2_costdetailname: z.string().max(128).optional(),
  attorney2_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney3name_cost: z.string().max(75).optional(),
  attorney3_costdetailname: z.string().max(128).optional(),
  attorney3_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney4name_cost: z.string().max(75).optional(),
  attorney4_costdetailname: z.string().max(128).optional(),
  attorney4_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney5name_cost: z.string().max(75).optional(),
  attorney5_costdetailname: z.string().max(128).optional(),
  attorney5_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney6name_cost: z.string().max(75).optional(),
  attorney6_costdetailname: z.string().max(128).optional(),
  attorney6_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney7name_cost: z.string().max(75).optional(),
  attorney7_costdetailname: z.string().max(128).optional(),
  attorney7_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney8name_cost: z.string().max(75).optional(),
  attorney8_costdetailname: z.string().max(128).optional(),
  attorney8_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney9name_cost: z.string().max(75).optional(),
  attorney9_costdetailname: z.string().max(128).optional(),
  attorney9_costdetailamount: z.number().max(9999999999.9999).optional(),
  attorney10name_cost: z.string().max(75).optional(),
  attorney10_costdetailname: z.string().max(128).optional(),
  attorney10_costdetailamount: z.number().max(9999999999.9999).optional(),
  
  // Notes
  lawfirmnote: z.string().max(1000).optional(),
  
  // System fields
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});

export type Demographics = z.infer<typeof DemographicsSchema>;

export const CreateDemographicsRequestSchema = DemographicsSchema.omit({
  id: true,
  partitionKey: true,
  created_at: true,
  updated_at: true,
  created_by: true,
});

export type CreateDemographicsRequest = z.infer<typeof CreateDemographicsRequestSchema>;

// API Key Schemas (from your example)
export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  partitionKey: z.string(),
  key_id: z.string(),
  key_hash: z.string(),
  name: z.string().max(100),
  description: z.string().max(500).optional(),
  
  law_firm: z.string().max(60),
  created_by: z.string().uuid(),
  
  rate_limits: z.object({
    requests_per_minute: z.number().int().min(1).max(10000).default(60),
    requests_per_hour: z.number().int().min(1).max(100000).default(3600),
    requests_per_day: z.number().int().min(1).max(1000000).default(86400),
    burst_limit: z.number().int().min(1).max(1000).default(100),
  }).default({}),
  
  scopes: z.array(z.enum([
    'demographics:read',
    'demographics:write', 
    'demographics:delete',
    'demographics:admin',
    'webhooks:manage',
    'files:upload'
  ])),
  
  status: z.enum(['active', 'suspended', 'revoked']).default('active'),
  last_used_at: z.string().datetime().optional(),
  last_used_ip: z.string().optional(),
  usage_count: z.number().int().default(0),
  
  expires_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  
  allowed_ips: z.array(z.string()).optional(),
  allowed_domains: z.array(z.string()).optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyRequestSchema = z.object({
  law_firm: z.string().min(3).max(60),
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.enum([
    'demographics:read',
    'demographics:write', 
    'demographics:delete',
    'demographics:admin',
    'webhooks:manage',
    'files:upload'
  ])).min(1),
  rate_limits: z.object({
    requests_per_minute: z.number().int().min(1).max(1000).default(60),
    requests_per_hour: z.number().int().min(1).max(10000).default(3600), 
    requests_per_day: z.number().int().min(1).max(100000).default(86400),
    burst_limit: z.number().int().min(1).max(500).default(100),
  }).optional(),
  expires_in_days: z.number().int().min(1).max(3650).optional(),
  allowed_ips: z.array(z.string().ip()).optional(),
  allowed_domains: z.array(z.string()).optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

// Queue Message Schema
export const QueueMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['webhook', 'email', 'sms']),
  payload: z.record(z.any()),
  priority: z.number().int().min(1).max(10).default(5),
  retry_count: z.number().int().default(0),
  max_retries: z.number().int().default(3),
  created_at: z.string().datetime(),
  scheduled_for: z.string().datetime().optional(),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

