import sql from 'mssql';
import { Demographics } from '../types/demographics';
import { ApiKey } from '../types/apiKey';
import { logger } from '../../azure-functions/monitor/winstonLogger';



class DatabaseService {
  private pool: sql.ConnectionPool | null = null;
  private readonly config: sql.config;

  constructor() {
    this.config = {
      server: process.env.DB_SERVER!,
      database: process.env.DB_DATABASE!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      port: parseInt(process.env.DB_PORT || '1433'),
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
      },
      pool: {
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000,
      },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    };
  }

  async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool || !this.pool.connected) {
      this.pool = new sql.ConnectionPool(this.config);
      await this.pool.connect();
      logger.info('Database connection established');
    }
    return this.pool;
  }

  // Demographics operations
  async createDemographic(demographic: Demographics): Promise<void> {
    const pool = await this.getPool();
    const request = pool.request();

    // Create parameterized query with all the fields
    const query = `
      INSERT INTO Demographics (
        id, partitionKey, law_firm, law_firm_approval, firstname, lastname, email, phone, sf_id, ml_id,
        law_firm_client_id, otherid, primarylawfirm, claimanttype, liensfinal,
        bankruptcy, bankruptcycleared, probate, probatecleared, pathway_opt_in_status,
        dod, serviceoptions, disbursementcount, milestonedisbursementid, paygroupid,
        honorific, genderidentity, pronouns, address1, address2, careof, city, state,
        region, zipcode, country, dob, ssn, claimantpersonalemail, claimantbusinessemail,
        claimantotheremail, claimantmobilephone, claimanthomephone, sms_opt_in,
        altclaimanttype, alternateclaimantsf_id, alternateclaimantml_id, alternateclaimantdob,
        alternateclaimantssn, alternateclaimantfirstname, alternateclaimantlastname,
        alternateclaimanthonorific, alternateclaimantaddress1, alternateclaimantaddress2,
        alternateclaimantcity, alternateclaimantstate, alternateclaimantregion,
        alternateclaimantzipcode, alternateclaimantcountry, alternateclaimantpersonalemail,
        alternateclaimantpersonalphonenumber, basegrossaward, eifawardamount, appealaward,
        totalgrossaward, commonbenefit, commonbenefittotal, commonbenefitattorneyshare,
        commonbenefitattorneyshareamount, commonbenefitclaimantshare, commonbenefitclaimantshareamount,
        attorneyfeecalcmethod, grosscontingencyfeeperc, grosscontingencyfeeamount,
        grossattorneyfeeperc, grossattorneyfeeamount, attorneyfeereduction, attorneycostreduction,
        attorneyfeeholdbackamount, totalnetattorneyfee, totalnetattorneycost, totaladmincost,
        othertotalliens, holdbackamount, otherholdbackamount, totalmedicalliens,
        previouspaymentstoclaimant, netclaimantpayment, generalcaseexpenses,
        attorney1name, attorney1feepercent, attorney1fees, attorney1costamount,
        attorney2name, attorney2feepercent, attorney2fees, attorney2costamount,
        attorney3name, attorney3feepercent, attorney3fees, attorney3costamount,
        attorney4name, attorney4feepercent, attorney4fees, attorney4costamount,
        attorney5name, attorney5feepercent, attorney5fees, attorney5costamount,
        attorney6name, attorney6feepercent, attorney6fees, attorney6costamount,
        attorney7name, attorney7feepercent, attorney7fees, attorney7costamount,
        attorney8name, attorney8feepercent, attorney8fees, attorney8costamount,
        attorney9name, attorney9feepercent, attorney9fees, attorney9costamount,
        attorney10name, attorney10feepercent, attorney10fees, attorney10costamount,
        vendorexpenseqsfadmin, vendorexpenseqsfadminname, vendorexpenseclaimsadmin,
        vendorexpenseclaimsadminname, vendorexpenselraholdback, vendorexpenselraholdbackname,
        vendorexpenselrafinal, vendorexpenselrafinalname, vendorexpensespecialmaster,
        vendorexpensespecialmastername, vendorexpenseeifappeal, vendorexpenseeifappealname,
        vendorexpensebankruptcycounsel, vendorexpensebankruptcycounselname, vendorexpenseprobatecounsel,
        vendorexpenseprobatecounselname, vendorother, vendorothername,
        medicallien1name, lienid1, lientype1, medicallien1,
        medicallien2name, lienid2, lientype2, medicallien2,
        medicallien3name, lienid3, lientype3, medicallien3,
        medicallien4name, lienid4, lientype4, medicallien4,
        medicallien5name, lienid5, lientype5, medicallien5,
        medicallien6name, lienid6, lientype6, medicallien6,
        otherlien1name, otherlien1amount, otherlien2name, otherlien2amount,
        attorney1name_cost, attorney1_costdetailname, attorney1_costdetailamount,
        attorney2name_cost, attorney2_costdetailname, attorney2_costdetailamount,
        attorney3name_cost, attorney3_costdetailname, attorney3_costdetailamount,
        attorney4name_cost, attorney4_costdetailname, attorney4_costdetailamount,
        attorney5name_cost, attorney5_costdetailname, attorney5_costdetailamount,
        attorney6name_cost, attorney6_costdetailname, attorney6_costdetailamount,
        attorney7name_cost, attorney7_costdetailname, attorney7_costdetailamount,
        attorney8name_cost, attorney8_costdetailname, attorney8_costdetailamount,
        attorney9name_cost, attorney9_costdetailname, attorney9_costdetailamount,
        attorney10name_cost, attorney10_costdetailname, attorney10_costdetailamount,
        lawfirmnote, created_at, updated_at, created_by, status
      ) VALUES (
        @id, @partitionKey, @law_firm, @law_firm_approval, @firstname, @lastname, @email, @phone, @sf_id, @ml_id,
        @law_firm_client_id, @otherid, @primarylawfirm, @claimanttype, @liensfinal,
        @bankruptcy, @bankruptcycleared, @probate, @probatecleared, @pathway_opt_in_status,
        @dod, @serviceoptions, @disbursementcount, @milestonedisbursementid, @paygroupid,
        @honorific, @genderidentity, @pronouns, @address1, @address2, @careof, @city, @state,
        @region, @zipcode, @country, @dob, @ssn, @claimantpersonalemail, @claimantbusinessemail,
        @claimantotheremail, @claimantmobilephone, @claimanthomephone, @sms_opt_in,
        @altclaimanttype, @alternateclaimantsf_id, @alternateclaimantml_id, @alternateclaimantdob,
        @alternateclaimantssn, @alternateclaimantfirstname, @alternateclaimantlastname,
        @alternateclaimanthonorific, @alternateclaimantaddress1, @alternateclaimantaddress2,
        @alternateclaimantcity, @alternateclaimantstate, @alternateclaimantregion,
        @alternateclaimantzipcode, @alternateclaimantcountry, @alternateclaimantpersonalemail,
        @alternateclaimantpersonalphonenumber, @basegrossaward, @eifawardamount, @appealaward,
        @totalgrossaward, @commonbenefit, @commonbenefittotal, @commonbenefitattorneyshare,
        @commonbenefitattorneyshareamount, @commonbenefitclaimantshare, @commonbenefitclaimantshareamount,
        @attorneyfeecalcmethod, @grosscontingencyfeeperc, @grosscontingencyfeeamount,
        @grossattorneyfeeperc, @grossattorneyfeeamount, @attorneyfeereduction, @attorneycostreduction,
        @attorneyfeeholdbackamount, @totalnetattorneyfee, @totalnetattorneycost, @totaladmincost,
        @othertotalliens, @holdbackamount, @otherholdbackamount, @totalmedicalliens,
        @previouspaymentstoclaimant, @netclaimantpayment, @generalcaseexpenses,
        @attorney1name, @attorney1feepercent, @attorney1fees, @attorney1costamount,
        @attorney2name, @attorney2feepercent, @attorney2fees, @attorney2costamount,
        @attorney3name, @attorney3feepercent, @attorney3fees, @attorney3costamount,
        @attorney4name, @attorney4feepercent, @attorney4fees, @attorney4costamount,
        @attorney5name, @attorney5feepercent, @attorney5fees, @attorney5costamount,
        @attorney6name, @attorney6feepercent, @attorney6fees, @attorney6costamount,
        @attorney7name, @attorney7feepercent, @attorney7fees, @attorney7costamount,
        @attorney8name, @attorney8feepercent, @attorney8fees, @attorney8costamount,
        @attorney9name, @attorney9feepercent, @attorney9fees, @attorney9costamount,
        @attorney10name, @attorney10feepercent, @attorney10fees, @attorney10costamount,
        @vendorexpenseqsfadmin, @vendorexpenseqsfadminname, @vendorexpenseclaimsadmin,
        @vendorexpenseclaimsadminname, @vendorexpenselraholdback, @vendorexpenselraholdbackname,
        @vendorexpenselrafinal, @vendorexpenselrafinalname, @vendorexpensespecialmaster,
        @vendorexpensespecialmastername, @vendorexpenseeifappeal, @vendorexpenseeifappealname,
        @vendorexpensebankruptcycounsel, @vendorexpensebankruptcycounselname, @vendorexpenseprobatecounsel,
        @vendorexpenseprobatecounselname, @vendorother, @vendorothername,
        @medicallien1name, @lienid1, @lientype1, @medicallien1,
        @medicallien2name, @lienid2, @lientype2, @medicallien2,
        @medicallien3name, @lienid3, @lientype3, @medicallien3,
        @medicallien4name, @lienid4, @lientype4, @medicallien4,
        @medicallien5name, @lienid5, @lientype5, @medicallien5,
        @medicallien6name, @lienid6, @lientype6, @medicallien6,
        @otherlien1name, @otherlien1amount, @otherlien2name, @otherlien2amount,
        @attorney1name_cost, @attorney1_costdetailname, @attorney1_costdetailamount,
        @attorney2name_cost, @attorney2_costdetailname, @attorney2_costdetailamount,
        @attorney3name_cost, @attorney3_costdetailname, @attorney3_costdetailamount,
        @attorney4name_cost, @attorney4_costdetailname, @attorney4_costdetailamount,
        @attorney5name_cost, @attorney5_costdetailname, @attorney5_costdetailamount,
        @attorney6name_cost, @attorney6_costdetailname, @attorney6_costdetailamount,
        @attorney7name_cost, @attorney7_costdetailname, @attorney7_costdetailamount,
        @attorney8name_cost, @attorney8_costdetailname, @attorney8_costdetailamount,
        @attorney9name_cost, @attorney9_costdetailname, @attorney9_costdetailamount,
        @attorney10name_cost, @attorney10_costdetailname, @attorney10_costdetailamount,
        @lawfirmnote, @created_at, @updated_at, @created_by, @status
      )
    `;

    // Add all parameters to the request (keeping your existing parameter code)
    request.input('id', sql.UniqueIdentifier, demographic.id);
    request.input('partitionKey', sql.VarChar(75), demographic.partitionKey);
    request.input('law_firm', sql.VarChar(55), demographic.law_firm);
    request.input('law_firm_approval', sql.VarChar(20), demographic.law_firm_approval);
    request.input('firstname', sql.VarChar(55), demographic.firstname);
    request.input('lastname', sql.VarChar(75), demographic.lastname);
    request.input('email', sql.VarChar(100), demographic.email);
    request.input('phone', sql.VarChar(11), demographic.phone);
    request.input('sf_id', sql.VarChar(50), demographic.sf_id);
    request.input('ml_id', sql.VarChar(50), demographic.ml_id);
    request.input('law_firm_client_id', sql.VarChar(50), demographic.law_firm_client_id);
    request.input('otherid', sql.VarChar(50), demographic.otherid);
    request.input('primarylawfirm', sql.VarChar(75), demographic.primarylawfirm);
    request.input('claimanttype', sql.VarChar(35), demographic.claimanttype);
    request.input('liensfinal', sql.VarChar(1), demographic.liensfinal);
    request.input('bankruptcy', sql.VarChar(1), demographic.bankruptcy);
    request.input('bankruptcycleared', sql.VarChar(50), demographic.bankruptcycleared);
    request.input('probate', sql.VarChar(1), demographic.probate);
    request.input('probatecleared', sql.VarChar(1), demographic.probatecleared);
    request.input('pathway_opt_in_status', sql.VarChar(1), demographic.pathway_opt_in_status);
    request.input('dod', sql.DateTime2, demographic.dod ? new Date(demographic.dod) : null);
    request.input('serviceoptions', sql.VarChar(75), demographic.serviceoptions);
    request.input('disbursementcount', sql.VarChar(35), demographic.disbursementcount);
    request.input('milestonedisbursementid', sql.VarChar(50), demographic.milestonedisbursementid);
    request.input('paygroupid', sql.VarChar(50), demographic.paygroupid);
    request.input('honorific', sql.VarChar(10), demographic.honorific);
    request.input('genderidentity', sql.VarChar(20), demographic.genderidentity);
    request.input('pronouns', sql.VarChar(20), demographic.pronouns);
    request.input('address1', sql.VarChar(75), demographic.address1);
    request.input('address2', sql.VarChar(75), demographic.address2);
    request.input('careof', sql.VarChar(75), demographic.careof);
    request.input('city', sql.VarChar(55), demographic.city);
    request.input('state', sql.VarChar(2), demographic.state);
    request.input('region', sql.VarChar(50), demographic.region);
    request.input('zipcode', sql.VarChar(25), demographic.zipcode);
    request.input('country', sql.VarChar(55), demographic.country);
    request.input('dob', sql.DateTime2, demographic.dob ? new Date(demographic.dob) : null);
    request.input('ssn', sql.VarChar(11), demographic.ssn);
    request.input('claimantpersonalemail', sql.VarChar(75), demographic.claimantpersonalemail);
    request.input('claimantbusinessemail', sql.VarChar(75), demographic.claimantbusinessemail);
    request.input('claimantotheremail', sql.VarChar(75), demographic.claimantotheremail);
    request.input('claimantmobilephone', sql.VarChar(20), demographic.claimantmobilephone);
    request.input('claimanthomephone', sql.VarChar(20), demographic.claimanthomephone);
    request.input('sms_opt_in', sql.VarChar(1), demographic.sms_opt_in);
    request.input('altclaimanttype', sql.VarChar(50), demographic.altclaimanttype);
    request.input('alternateclaimantsf_id', sql.VarChar(50), demographic.alternateclaimantsf_id);
    request.input('alternateclaimantml_id', sql.VarChar(50), demographic.alternateclaimantml_id);
    request.input('alternateclaimantdob', sql.VarChar(10), demographic.alternateclaimantdob);
    request.input('alternateclaimantssn', sql.VarChar(11), demographic.alternateclaimantssn);
    request.input('alternateclaimantfirstname', sql.VarChar(55), demographic.alternateclaimantfirstname);
    request.input('alternateclaimantlastname', sql.VarChar(75), demographic.alternateclaimantlastname);
    request.input('alternateclaimanthonorific', sql.VarChar(10), demographic.alternateclaimanthonorific);
    request.input('alternateclaimantaddress1', sql.VarChar(75), demographic.alternateclaimantaddress1);
    request.input('alternateclaimantaddress2', sql.VarChar(75), demographic.alternateclaimantaddress2);
    request.input('alternateclaimantcity', sql.VarChar(55), demographic.alternateclaimantcity);
    request.input('alternateclaimantstate', sql.VarChar(2), demographic.alternateclaimantstate);
    request.input('alternateclaimantregion', sql.VarChar(50), demographic.alternateclaimantregion);
    request.input('alternateclaimantzipcode', sql.VarChar(25), demographic.alternateclaimantzipcode);
    request.input('alternateclaimantcountry', sql.VarChar(55), demographic.alternateclaimantcountry);
    request.input('alternateclaimantpersonalemail', sql.VarChar(75), demographic.alternateclaimantpersonalemail);
    request.input('alternateclaimantpersonalphonenumber', sql.VarChar(20), demographic.alternateclaimantpersonalphonenumber);
    
    // Financial fields
    request.input('basegrossaward', sql.Decimal(15, 4), demographic.basegrossaward);
    request.input('eifawardamount', sql.Decimal(15, 4), demographic.eifawardamount);
    request.input('appealaward', sql.Decimal(15, 4), demographic.appealaward);
    request.input('totalgrossaward', sql.Decimal(15, 4), demographic.totalgrossaward);
    request.input('commonbenefit', sql.Decimal(10, 4), demographic.commonbenefit);
    request.input('commonbenefittotal', sql.Decimal(15, 4), demographic.commonbenefittotal);
    request.input('commonbenefitattorneyshare', sql.Decimal(10, 4), demographic.commonbenefitattorneyshare);
    request.input('commonbenefitattorneyshareamount', sql.Decimal(15, 4), demographic.commonbenefitattorneyshareamount);
    request.input('commonbenefitclaimantshare', sql.Decimal(10, 4), demographic.commonbenefitclaimantshare);
    request.input('commonbenefitclaimantshareamount', sql.Decimal(15, 4), demographic.commonbenefitclaimantshareamount);
    request.input('attorneyfeecalcmethod', sql.VarChar(20), demographic.attorneyfeecalcmethod);
    request.input('grosscontingencyfeeperc', sql.Decimal(10, 4), demographic.grosscontingencyfeeperc);
    request.input('grosscontingencyfeeamount', sql.Decimal(15, 4), demographic.grosscontingencyfeeamount);
    request.input('grossattorneyfeeperc', sql.Decimal(10, 4), demographic.grossattorneyfeeperc);
    request.input('grossattorneyfeeamount', sql.Decimal(15, 4), demographic.grossattorneyfeeamount);
    request.input('attorneyfeereduction', sql.Decimal(15, 4), demographic.attorneyfeereduction);
    request.input('attorneycostreduction', sql.Decimal(15, 4), demographic.attorneycostreduction);
    request.input('attorneyfeeholdbackamount', sql.Decimal(15, 4), demographic.attorneyfeeholdbackamount);
    request.input('totalnetattorneyfee', sql.Decimal(15, 4), demographic.totalnetattorneyfee);
    request.input('totalnetattorneycost', sql.Decimal(15, 4), demographic.totalnetattorneycost);
    request.input('totaladmincost', sql.Decimal(15, 4), demographic.totaladmincost);
    request.input('othertotalliens', sql.Decimal(15, 4), demographic.othertotalliens);
    request.input('holdbackamount', sql.Decimal(15, 4), demographic.holdbackamount);
    request.input('otherholdbackamount', sql.Decimal(15, 4), demographic.otherholdbackamount);
    request.input('totalmedicalliens', sql.Decimal(15, 4), demographic.totalmedicalliens);
    request.input('previouspaymentstoclaimant', sql.Decimal(15, 4), demographic.previouspaymentstoclaimant);
    request.input('netclaimantpayment', sql.Decimal(15, 4), demographic.netclaimantpayment);
    request.input('generalcaseexpenses', sql.Decimal(15, 4), demographic.generalcaseexpenses);

    // Attorney information (10 attorneys)
    for (let i = 1; i <= 10; i++) {
      const attorneyName = `attorney${i}name` as keyof Demographics;
      const attorneyFeePercent = `attorney${i}feepercent` as keyof Demographics;
      const attorneyFees = `attorney${i}fees` as keyof Demographics;
      const attorneyCostAmount = `attorney${i}costamount` as keyof Demographics;
      
      request.input(`attorney${i}name`, sql.VarChar(75), demographic[attorneyName]);
      request.input(`attorney${i}feepercent`, sql.Decimal(10, 4), demographic[attorneyFeePercent]);
      request.input(`attorney${i}fees`, sql.Decimal(15, 4), demographic[attorneyFees]);
      request.input(`attorney${i}costamount`, sql.Decimal(15, 4), demographic[attorneyCostAmount]);
    }

    // Vendor expenses
    request.input('vendorexpenseqsfadmin', sql.Decimal(15, 4), demographic.vendorexpenseqsfadmin);
    request.input('vendorexpenseqsfadminname', sql.VarChar(55), demographic.vendorexpenseqsfadminname);
    request.input('vendorexpenseclaimsadmin', sql.Decimal(15, 4), demographic.vendorexpenseclaimsadmin);
    request.input('vendorexpenseclaimsadminname', sql.VarChar(55), demographic.vendorexpenseclaimsadminname);
    request.input('vendorexpenselraholdback', sql.Decimal(15, 4), demographic.vendorexpenselraholdback);
    request.input('vendorexpenselraholdbackname', sql.VarChar(55), demographic.vendorexpenselraholdbackname);
    request.input('vendorexpenselrafinal', sql.Decimal(15, 4), demographic.vendorexpenselrafinal);
    request.input('vendorexpenselrafinalname', sql.VarChar(55), demographic.vendorexpenselrafinalname);
    request.input('vendorexpensespecialmaster', sql.Decimal(15, 4), demographic.vendorexpensespecialmaster);
    request.input('vendorexpensespecialmastername', sql.VarChar(55), demographic.vendorexpensespecialmastername);
    request.input('vendorexpenseeifappeal', sql.Decimal(15, 4), demographic.vendorexpenseeifappeal);
    request.input('vendorexpenseeifappealname', sql.VarChar(55), demographic.vendorexpenseeifappealname);
    request.input('vendorexpensebankruptcycounsel', sql.Decimal(15, 4), demographic.vendorexpensebankruptcycounsel);
    request.input('vendorexpensebankruptcycounselname', sql.VarChar(55), demographic.vendorexpensebankruptcycounselname);
    request.input('vendorexpenseprobatecounsel', sql.Decimal(15, 4), demographic.vendorexpenseprobatecounsel);
    request.input('vendorexpenseprobatecounselname', sql.VarChar(55), demographic.vendorexpenseprobatecounselname);
    request.input('vendorother', sql.Decimal(15, 4), demographic.vendorother);
    request.input('vendorothername', sql.VarChar(55), demographic.vendorothername);

    // Medical liens (6 liens)
    for (let i = 1; i <= 6; i++) {
      const lienName = `medicallien${i}name` as keyof Demographics;
      const lienId = `lienid${i}` as keyof Demographics;
      const lienType = `lientype${i}` as keyof Demographics;
      const lienAmount = `medicallien${i}` as keyof Demographics;
      
      request.input(`medicallien${i}name`, sql.VarChar(55), demographic[lienName]);
      request.input(`lienid${i}`, sql.VarChar(55), demographic[lienId]);
      request.input(`lientype${i}`, sql.VarChar(35), demographic[lienType]);
      request.input(`medicallien${i}`, sql.Decimal(15, 4), demographic[lienAmount]);
    }

    // Other liens
    request.input('otherlien1name', sql.VarChar(55), demographic.otherlien1name);
    request.input('otherlien1amount', sql.Decimal(15, 4), demographic.otherlien1amount);
    request.input('otherlien2name', sql.VarChar(55), demographic.otherlien2name);
    request.input('otherlien2amount', sql.Decimal(15, 4), demographic.otherlien2amount);

    // Attorney cost details (10 attorneys)
    for (let i = 1; i <= 10; i++) {
      const attorneyNameCost = `attorney${i}name_cost` as keyof Demographics;
      const costDetailName = `attorney${i}_costdetailname` as keyof Demographics;
      const costDetailAmount = `attorney${i}_costdetailamount` as keyof Demographics;
      
      request.input(`attorney${i}name_cost`, sql.VarChar(75), demographic[attorneyNameCost]);
      request.input(`attorney${i}_costdetailname`, sql.VarChar(128), demographic[costDetailName]);
      request.input(`attorney${i}_costdetailamount`, sql.Decimal(15, 4), demographic[costDetailAmount]);
    }

    // Notes and system fields
    request.input('lawfirmnote', sql.VarChar(1000), demographic.lawfirmnote);
    request.input('created_at', sql.DateTime2, new Date(demographic.created_at));
    request.input('updated_at', sql.DateTime2, new Date(demographic.updated_at));
    request.input('created_by', sql.UniqueIdentifier, demographic.created_by);
    request.input('status', sql.VarChar(20), demographic.status);

    await request.query(query);
  }

  async getDemographicById(id: string, lawFirm: string): Promise<Demographics | null> {
    const pool = await this.getPool();
    const request = pool.request();

    const result = await request
      .input('id', sql.UniqueIdentifier, id)
      .input('partitionKey', sql.VarChar(75), lawFirm)
      .query(`
        SELECT * FROM Demographics 
        WHERE id = @id AND partitionKey = @partitionKey
      `);

    if (result.recordset.length === 0) return null;

    return result.recordset[0] as Demographics;
  }

  async getDemographicsByLawFirm(
    lawFirm: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Demographics[]> { 
    const pool = await this.getPool();
    const request = pool.request();

    const result = await request
      .input('partitionKey', sql.VarChar(75), lawFirm)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(`
        SELECT * FROM Demographics 
        WHERE partitionKey = @partitionKey
        ORDER BY created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    return result.recordset as Demographics[];
  }

  // API Key operations
  async createApiKey(apiKey: ApiKey): Promise<void> {
    const pool = await this.getPool();
    const request = pool.request();

    const query = `
      INSERT INTO ApiKeys (
        id, partitionKey, key_id, key_hash, name, description, law_firm, created_by,
        rate_limits, scopes, status, last_used_at, last_used_ip, usage_count, expires_at,
        created_at, updated_at, allowed_ips, allowed_domains, environment
      ) VALUES (
        @id, @partitionKey, @key_id, @key_hash, @name, @description, @law_firm, @created_by,
        @rate_limits, @scopes, @status, @last_used_at, @last_used_ip, @usage_count, @expires_at,
        @created_at, @updated_at, @allowed_ips, @allowed_domains, @environment
      )
    `;

    request.input('id', sql.UniqueIdentifier, apiKey.id);
    request.input('partitionKey', sql.VarChar(75), apiKey.partitionKey);
    request.input('key_id', sql.VarChar(50), apiKey.key_id);
    request.input('key_hash', sql.VarChar(255), apiKey.key_hash);
    request.input('name', sql.VarChar(100), apiKey.name);
    request.input('description', sql.VarChar(500), apiKey.description);
    request.input('law_firm', sql.VarChar(60), apiKey.law_firm);
    request.input('created_by', sql.UniqueIdentifier, apiKey.created_by);
    request.input('rate_limits', sql.NVarChar(sql.MAX), JSON.stringify(apiKey.rate_limits));
    request.input('scopes', sql.NVarChar(sql.MAX), JSON.stringify(apiKey.scopes));
    request.input('status', sql.VarChar(20), apiKey.status);
    request.input('last_used_at', sql.DateTime2, apiKey.last_used_at ? new Date(apiKey.last_used_at) : null);
    request.input('last_used_ip', sql.VarChar(45), apiKey.last_used_ip);
    request.input('usage_count', sql.Int, apiKey.usage_count);
    request.input('expires_at', sql.DateTime2, apiKey.expires_at ? new Date(apiKey.expires_at) : null);
    request.input('created_at', sql.DateTime2, new Date(apiKey.created_at));
    request.input('updated_at', sql.DateTime2, new Date(apiKey.updated_at));
    request.input('allowed_ips', sql.NVarChar(sql.MAX), apiKey.allowed_ips ? JSON.stringify(apiKey.allowed_ips) : null);
    request.input('allowed_domains', sql.NVarChar(sql.MAX), apiKey.allowed_domains ? JSON.stringify(apiKey.allowed_domains) : null);
    request.input('environment', sql.VarChar(20), apiKey.environment);

    await request.query(query);
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const pool = await this.getPool();
    const request = pool.request();

    const result = await request
      .input('key_hash', sql.VarChar(255), keyHash)
      .query(`
        SELECT * FROM ApiKeys 
        WHERE key_hash = @key_hash AND status != 'revoked'
      `);

    if (result.recordset.length === 0) return null;

    const row = result.recordset[0];
    
    // Parse JSON fields
    return {
      ...row,
      rate_limits: JSON.parse(row.rate_limits),
      scopes: JSON.parse(row.scopes),
      allowed_ips: row.allowed_ips ? JSON.parse(row.allowed_ips) : null,
      allowed_domains: row.allowed_domains ? JSON.parse(row.allowed_domains) : null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      expires_at: row.expires_at ? row.expires_at.toISOString() : null,
      last_used_at: row.last_used_at ? row.last_used_at.toISOString() : null,
    } as ApiKey;
  }

  async updateApiKeyUsage(apiKeyId: string, ipAddress: string): Promise<void> {
    const pool = await this.getPool();
    const request = pool.request();

    const query = `
      UPDATE ApiKeys 
      SET usage_count = usage_count + 1,
          last_used_at = GETUTCDATE(),
          last_used_ip = @last_used_ip,
          updated_at = GETUTCDATE()
      WHERE id = @id
    `;

    request.input('id', sql.UniqueIdentifier, apiKeyId);
    request.input('last_used_ip', sql.VarChar(45), ipAddress);

    await request.query(query);
  }
}

export const databaseService = new DatabaseService();