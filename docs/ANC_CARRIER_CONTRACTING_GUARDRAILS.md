# ANC Carrier Contracting & Customer Privacy Guardrails

These rules are mandatory across ANCLINE NVOCC and Forwarding workflows.

## Contracting identity

- ANC is the contracting and authenticated party with ocean carriers and other carrier-side providers.
- Carrier/API/EDI/portal credentials belong to ANC or an authorized ANC branch account.
- External carrier requests use ANC booking-party identity and ANC-controlled references only.
- Customer, shipper, consignee and agent users transact with ANC. They do not become the carrier account holder.

## Reference ownership

Customer-facing commercial and booking references must be ANC references.

- Forwarding quote: `ANC-FWD-Q-...`
- Forwarding booking: `ANC-FWD-BKG-...`
- NVOCC quote: `ANC-NVOCC-Q-...`
- NVOCC booking: `ANC-NVOCC-BKG-...`
- ANC customer reference remains an ANC internal/customer master reference.

Carrier quote numbers, carrier booking numbers and carrier account codes are internal carrier-side linkage. They may be stored for operations/audit but must not be presented as the customer's contractual ANC reference.

## KYC and house-data firewall

ANC customer KYC is ANC master-data only and must never be sent to a carrier.

Carrier outbound payloads must not contain:

- customer ID, ANC customer reference or customer reference
- KYC data/status, registration reference, UBO/beneficial-owner data
- customer name/address/email/phone from ANC customer master
- house B/L data or house-document payload
- customer shipper/consignee/notify-party data
- shipper reference

Carrier master-document parties, when required, must be populated from configured ANC carrier/master identity, not from ANC customer KYC or house parties.

## Rate and booking flow

Customer/shipper/consignee -> ANC rate display -> ANC quote -> accepted ANC terms -> ANC booking -> ANC controls -> carrier booking.

Carrier rate procurement and booking payloads may contain operational shipment data needed by the carrier, such as lane, equipment, quantity, commodity, gross weight, volume, schedule and special-cargo parameters, but not customer/KYC/house identity.

## Payment terms and payer parties

Customer-to-ANC commercial terms are separate from ANC-to-carrier settlement instructions. Customer `freightTerms` must not be copied directly into carrier booking or amendment payloads.

Carrier settlement is controlled per charge group:

1. Origin Port
2. Sea Freight
3. Destination Port
4. Origin Haulage, when applicable
5. Destination Haulage, when applicable

Allowed carrier settlement terms:

- Prepaid (Origin)
- Collect
- Prepaid (Elsewhere)
- Not Applicable, only for optional haulage groups

Prepaid/Collect payer must be an active registered ANC office.

For Prepaid (Elsewhere):

- payer name and address are entered manually as the ANC payer office details;
- payer country must match a country with an active registered ANC office/branch in ANCLINE;
- customer payer data must never be used as a carrier payer.

Carrier booking submission is held until ANC carrier payment/payer instructions are validated.

## Enforcement

All new carrier-facing API/EDI integrations must pass through the ANC carrier outbound privacy firewall and must use a whitelist-style payload. New VGM, Shipping Instructions, B/L Draft, tracking and amendment integrations must preserve these rules.
