// Georgian names of the listed launches. The chain stores only an English
// name. The first twelve on Arbitrum One carry the names of Georgian public
// companies from the project's first experiment.
export const KA_NAMES = {
  "Sakartvelo Land Fund": "საქართველოს მიწის ფონდი",
  "Bolnisi Gold Mines": "ბოლნისის ოქროს მაღაროები",
  "Tkibuli Coal Basin": "ტყიბულის ქვანახშირის აუზი",
  "Racha Marble Works": "რაჭის მარმარილოს კომბინატი",
  "National Forest Fund": "ეროვნული ტყის ფონდი",
  "Georgian Railway": "საქართველოს რკინიგზა",
  "Chiatura Manganese Concern": "ჭიათურის მანგანუმის კონცერნი",
  "Zestafoni Ferroalloys Plant": "ზესტაფონის ფეროშენადნობთა ქარხანა",
  "Enguri Hydropower Plant": "ენგურის ჰესი",
  "Batumi Sea Port": "ბათუმის საზღვაო პორტი",
  "Anaklia Deep Sea Port": "ანაკლიის ღრმაწყლოვანი პორტი",
  "Georgian Stock Exchange": "საქართველოს საფონდო ბირჟა",
  "Demo Project Alpha": "სადემო პროექტი ალფა",
  "Demo Project Beta": "სადემო პროექტი ბეტა",
  "Demo Project Gamma": "სადემო პროექტი გამა",
  "Demo Project Delta": "სადემო პროექტი დელტა",
  "Demo Project Epsilon": "სადემო პროექტი ეფსილონი",
  "Demo Project Zeta": "სადემო პროექტი ზეტა",
};

export function kaName(name) {
  return KA_NAMES[name] || null;
}
