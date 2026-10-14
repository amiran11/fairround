// Georgian names of the listed companies. The chain stores only an English
// name.
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
};

export function kaName(name) {
  return KA_NAMES[name] || null;
}
