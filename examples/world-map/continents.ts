/**
 * Which continent each country of `world-atlas`'s 110m map is in, by the name it carries there.
 * The map has no continents of its own; these follow Natural Earth's `CONTINENT` field, so Russia
 * is in Europe, Turkey and the Caucasus in Asia, and Greenland in North America.
 */
export const CONTINENTS: Record<string, string[]> = {
  Africa: [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Central African Rep.", "Chad", "Congo",
    "Côte d'Ivoire", "Dem. Rep. Congo", "Djibouti", "Egypt", "Eq. Guinea", "Eritrea", "eSwatini", "Ethiopia", "Gabon", "Gambia",
    "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
    "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda", "S. Sudan", "Senegal", "Sierra Leone", "Somalia",
    "Somaliland", "South Africa", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "W. Sahara", "Zambia", "Zimbabwe",
  ],
  Asia: [
    "Afghanistan", "Armenia", "Azerbaijan", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "China", "Cyprus", "Georgia", "India",
    "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon",
    "Malaysia", "Mongolia", "Myanmar", "N. Cyprus", "Nepal", "North Korea", "Oman", "Pakistan", "Palestine", "Philippines",
    "Qatar", "Saudi Arabia", "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey",
    "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",
  ],
  Europe: [
    "Albania", "Austria", "Belarus", "Belgium", "Bosnia and Herz.", "Bulgaria", "Croatia", "Czechia", "Denmark", "Estonia",
    "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Lithuania",
    "Luxembourg", "Macedonia", "Moldova", "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Russia",
    "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom",
  ],
  "North America": [
    "Bahamas", "Belize", "Canada", "Costa Rica", "Cuba", "Dominican Rep.", "El Salvador", "Greenland", "Guatemala", "Haiti",
    "Honduras", "Jamaica", "Mexico", "Nicaragua", "Panama", "Puerto Rico", "Trinidad and Tobago", "United States of America",
  ],
  "South America": [
    "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Falkland Is.", "Guyana", "Paraguay", "Peru", "Suriname",
    "Uruguay", "Venezuela",
  ],
  Oceania: ["Australia", "Fiji", "New Caledonia", "New Zealand", "Papua New Guinea", "Solomon Is.", "Vanuatu"],
  Antarctica: ["Antarctica", "Fr. S. Antarctic Lands"],
};

/** Where each continent's name goes, as [longitude, latitude]: its countries' middle can be at sea. */
export const LABEL_AT: Record<string, [number, number]> = {
  Africa: [20, 5],
  Asia: [95, 35],
  Europe: [30, 55],
  "North America": [-100, 45],
  "South America": [-60, -15],
  Oceania: [140, -25],
  Antarctica: [0, -80],
};
