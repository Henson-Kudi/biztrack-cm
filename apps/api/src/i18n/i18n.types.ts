export interface I18nTranslations {
  auth: {
    register: {
      success: string
      phone_exists: string
      email_exists: string
    }
    otp: {
      invalid: string
      expired: string
      max_attempts: string
      sent_phone: string
      sent_email: string
      attempts_left: string
    }
    login: {
      invalid_credentials: string
      account_locked: string
      too_many_attempts: string
      success: string
      password_not_configured: string
      account_deactivated: string
      identifier_required: string
      user_not_found: string
    }
    token: {
      invalid: string
      expired: string
      reuse_detected: string
    }
    logout: {
      success: string
    }
    verify: {
      phone_success: string
      email_success: string
      phone_not_verified: string
      email_not_verified: string
      email_not_configured: string
    }
  }
  errors: {
    not_found: string
    unauthorized: string
    forbidden: string
    plan_upgrade_required: string
    wrong_onboarding_step: string
    select_business_required: string
    validation_failed: string
    server_error: string
    rate_limited: string
    user_not_found: string
    business_not_found: string
    business_forbidden: string
    business_already_exists: string
    invite_invalid: string
    invite_contact_required: string
    invite_already_member: string
    invite_already_pending: string
    barcode_in_use: string
    invalid_barcode_check_digit: string
    invalid_sku_format: string
    sku_in_use: string
    product_not_found: string
    product_sku_generation_failed: string
    product_sku_immutable: string
    product_images_limit_reached: string
    product_image_not_found: string
    category_not_found: string
    category_has_products: string
    inventory_not_found: string
    inventory_insufficient_stock: string
    unit_of_measure_exists: string
    unit_of_measure_not_found: string
    unit_of_measure_in_use: string
    unit_of_measure_system_immutable: string
  }
  plans: {
    selected: string
    free_selected: string
    upgraded: string
    downgraded: string
    cancelled: string
    trial_ending_soon: string
    trial_ended: string
  }
  notifications: {
    otp_sms: string
    otp_whatsapp: string
    trial_ending_soon: string
    trial_ended: string
    payment_failed: string
    welcome: string
  }
  validation: {
    phone_format: string
    password_strength: string
    required: string
    invalid_email: string
    otp_format: string
    invalid_enum: string
  }
}
