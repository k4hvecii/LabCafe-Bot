function heroWorkshop(){return '<svg viewBox="0 0 620 470" aria-hidden="true"><rect x="60" y="70" width="500" height="310" rx="16" fill="none" stroke="currentColor"/><path d="M95 140h430M95 205h280M95 270h350" stroke="currentColor"/></svg>';}
const app = document.querySelector('#app');
const state = { user:null, csrf:'', guilds:[], guild:null, settings:null, draft:null, commands:[],
  analysis:null, history:[], saveMessage:'', saveStatus:0, saveError:false, navigation:0, isOwner:false, saving:false, clientId:document.querySelector('meta[name="discord-client-id"]')?.content||'', supportGuildId:null, supportInviteUrl:null, publicGuilds:[], publicGuildCount:0, view:'guilds' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Upstream Lucide and Simple Icons SVGs; notices: dashboard/ICON-LICENSES.txt
const icons = {"check": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M20 6 9 17l-5-5\" />\n</svg>\n", "chevron": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"m9 18 6-6-6-6\" />\n</svg>\n", "down": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"m6 9 6 6 6-6\" />\n</svg>\n", "eye": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" />\n  <circle cx=\"12\" cy=\"12\" r=\"3\" />\n</svg>\n", "channel": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <line x1=\"4\" x2=\"20\" y1=\"9\" y2=\"9\" />\n  <line x1=\"4\" x2=\"20\" y1=\"15\" y2=\"15\" />\n  <line x1=\"10\" x2=\"8\" y1=\"3\" y2=\"21\" />\n  <line x1=\"16\" x2=\"14\" y1=\"3\" y2=\"21\" />\n</svg>\n", "shield": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />\n  <path d=\"m9 12 2 2 4-4\" />\n</svg>\n", "refresh": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" />\n  <path d=\"M21 3v5h-5\" />\n  <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" />\n  <path d=\"M8 16H3v5\" />\n</svg>\n", "menu": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M4 5h16\" />\n  <path d=\"M4 12h16\" />\n  <path d=\"M4 19h16\" />\n</svg>\n", "terminal": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M12 19h8\" />\n  <path d=\"m4 17 6-6-6-6\" />\n</svg>\n", "logout": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"m16 17 5-5-5-5\" />\n  <path d=\"M21 12H9\" />\n  <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" />\n</svg>\n", "info": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 16v-4\" />\n  <path d=\"M12 8h.01\" />\n</svg>\n", "coffee": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M10 2v2\" />\n  <path d=\"M14 2v2\" />\n  <path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" />\n  <path d=\"M6 2v2\" />\n</svg>\n", "discord": "<svg role=\"img\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" class=\"icon icon-brand\" aria-hidden=\"true\" focusable=\"false\"><title>Discord</title><path d=\"M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z\"/></svg>", "trending": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M16 7h6v6\" />\n  <path d=\"m22 7-8.5 8.5-5-5L2 17\" />\n</svg>\n", "close": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n class=\"icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path d=\"M18 6 6 18\" />\n  <path d=\"m6 6 12 12\" />\n</svg>\n"};
icons.grid="<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" class=\"icon\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/></svg>";
icons.settings="<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" class=\"icon\" aria-hidden=\"true\"><path d=\"M4 7h16M4 17h16\"/><circle cx=\"8\" cy=\"7\" r=\"3\"/><circle cx=\"16\" cy=\"17\" r=\"3\"/></svg>";
icons.search="<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" class=\"icon\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m16 16 5 5\"/></svg>";
const icon = name => icons[name] || icons.info;
// Discord server badges from Fmasterpro27/Discord-badges (MIT); see BADGE-LICENSE.txt.
const guildBadges = {"verified": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"61\" height=\"61\" viewBox=\"0 0 61 61\" fill=\"none\" class=\"guild-status-icon\" aria-hidden=\"true\" focusable=\"false\">\n  <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M61 31.052c0 3.012-4.88 5.26-5.795 7.968-.915 2.707 1.678 7.625 0 9.874s-7.015 1.335-9.379 3.05c-2.364 1.716-3.012 7.015-5.871 7.968s-6.367-3.05-9.417-3.05-6.672 3.813-9.417 3.05c-2.745-.762-3.507-6.252-5.871-7.968-2.364-1.715-7.625-.686-9.379-3.05s.877-7.015 0-9.874S0 34.064 0 31.052s4.88-5.262 5.795-7.968-1.678-7.625 0-9.875 7.053-1.334 9.455-3.05 2.974-7.015 5.833-8.082S27.45 5.24 30.5 5.24s6.672-3.812 9.417-3.05c2.745.763 3.47 6.253 5.833 7.968 2.364 1.716 7.625.686 9.379 3.05s-.877 7.015 0 9.875S61 28.04 61 31.052\" fill=\"#43A25A\" />\n  <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M44.499 20.611a2.065 2.065 0 0 1 0 2.891L27.978 40.023a2.065 2.065 0 0 1-2.891 0l-8.26-8.26a2.067 2.067 0 0 1 .516-3.587 2.06 2.06 0 0 1 2.374.696l6.815 6.794L41.608 20.59a2.065 2.065 0 0 1 2.891 0z\" fill=\"#fff\" />\n</svg>", "partnered": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"61\" height=\"60\" viewBox=\"0 0 61 60\" fill=\"none\" class=\"guild-status-icon\" aria-hidden=\"true\" focusable=\"false\">\n<g clip-path=\"url(#clip0_502_7213)\">\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M60.5041 30.1124C60.5041 33.0707 55.7051 35.2801 54.8053 37.9388C53.9055 40.5975 56.4549 45.4282 54.8053 47.6375C53.1556 49.8469 47.9067 48.9482 45.5822 50.6333C43.2577 52.3184 42.6203 57.5235 39.8084 58.4596C36.9965 59.3958 33.5472 55.4639 30.5478 55.4639C27.5485 55.4639 23.9867 59.2086 21.2873 58.4596C18.5878 57.7107 17.838 52.3184 15.5135 50.6333C13.189 48.9482 8.01504 49.9592 6.2904 47.6375C4.56576 45.3158 7.15272 40.7473 6.2904 37.9388C5.42808 35.1303 0.516602 33.0707 0.516602 30.1124C0.516602 27.1541 5.3156 24.9448 6.21541 22.286C7.11523 19.6273 4.56576 14.7967 6.21541 12.5873C7.86507 10.378 13.1515 11.2767 15.5135 9.59157C17.8755 7.90647 18.4379 2.70136 21.2498 1.65285C24.0617 0.604339 27.511 4.76093 30.5104 4.76093C33.5097 4.76093 37.0715 1.01625 39.7709 1.76519C42.4704 2.51413 43.1827 7.90647 45.5072 9.59157C47.8317 11.2767 53.0057 10.2656 54.7303 12.5873C56.4549 14.909 53.868 19.4775 54.7303 22.286C55.5926 25.0945 60.5041 27.1541 60.5041 30.1124Z\" fill=\"#5865F2\" />\n<path d=\"M50.3593 29.9369C50.3593 31.4312 49.6192 32.9257 48.5089 33.6729L37.0373 41.1448C34.8169 42.6391 32.5965 43.3864 30.0061 43.3864C28.8959 43.3864 28.1559 43.3864 27.0456 43.0128C24.0853 42.2657 21.8649 40.7712 20.0146 38.5297C19.6445 37.7824 20.0146 37.0352 20.3847 36.6617L25.5654 33.2993C25.9355 32.9257 26.6756 32.9257 27.0456 33.2993C27.7858 33.6729 28.5259 34.0465 28.8959 34.42C30.3762 34.42 31.4864 34.42 32.5965 33.6729L35.1869 32.1784L42.588 26.9481L43.6983 26.2009C45.5485 25.0801 48.5089 25.4538 49.6192 27.3217C50.3593 28.4426 50.3593 29.1897 50.3593 29.9369Z\" fill=\"white\" />\n<path d=\"M41.1239 23.1573L35.9052 26.5397C35.1597 26.9155 34.7869 26.9155 34.0413 26.5397C33.6686 26.1639 32.9231 25.7881 32.5503 25.4123C31.0592 25.0364 29.941 25.4123 28.8226 26.1639L26.9588 27.2914L17.6397 33.6805C15.4031 34.8079 12.7937 34.4321 11.6754 32.1771C10.1843 30.2979 10.9299 27.6672 12.7937 26.1639L23.9767 18.6474C26.9588 16.7682 30.6865 16.0166 34.0413 16.7682C37.0235 17.5199 39.2601 19.0232 41.1239 21.2782C41.8695 22.0299 41.4967 22.7815 41.1239 23.1573Z\" fill=\"white\" />\n</g>\n<defs>\n<clipPath id=\"clip0_502_7213\">\n<rect width=\"60\" height=\"60\" fill=\"white\" transform=\"translate(0.516602)\" />\n</clipPath>\n</defs>\n</svg>", "community": "<svg xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\" width=\"5.1648mm\" height=\"5.08mm\" version=\"1.1\" viewBox=\"0 0 516.48 508\" class=\"guild-status-icon\" aria-hidden=\"true\" focusable=\"false\">\n <defs>\n  </defs>\n <g>\n  <g id=\"_1943987413504\">\n   <path class=\"fil0\" d=\"M486.44 294.49c12.77,-12.43 25.81,-25.1 25.81,-39.89 0,-14.39 -12.7,-26.39 -25.39,-38.42 -10.49,-9.91 -20.97,-19.87 -24.33,-31.15 -3.31,-11.14 -0.72,-25.33 1.83,-39.53 3.21,-17.66 6.41,-35.28 -1.83,-46.73 -8.19,-11.41 -25.46,-13.77 -42.62,-16.13 -13.95,-1.92 -27.83,-3.81 -36.79,-10.54 -8.92,-6.65 -15.09,-19.9 -21.23,-33.11 -7.66,-16.4 -15.28,-32.77 -28.17,-36.47 -12.54,-3.57 -27.22,4.45 -42.16,12.59 -12.73,7 -25.66,14.05 -37.55,14.05 -11.52,0 -23.83,-7.36 -36.07,-14.68 -15.17,-9.08 -30.26,-18.13 -43.64,-12.98 -13.31,5.16 -20.74,21.4 -28.14,37.49 -6.06,13.25 -12.08,26.39 -21.27,33.12 -9.18,6.8 -23.56,8.89 -37.85,10.93 -17.27,2.52 -34.43,4.95 -42.2,15.73 -7.78,10.78 -4.69,28.6 -1.57,46.41 2.52,14.6 5.07,29.19 1.57,39.85 -3.4,10.38 -13.27,19.98 -23.26,29.7 -12.77,12.46 -25.81,25.13 -25.81,39.88 0,14.43 12.7,26.43 25.39,38.47 10.49,9.91 20.97,19.86 24.33,31.15 3.31,11.09 0.72,25.33 -1.83,39.48 -3.21,17.7 -6.41,35.28 1.83,46.77 8.19,11.41 25.46,13.77 42.62,16.13 13.95,1.89 27.83,3.81 36.79,10.5 8.92,6.68 15.13,19.9 21.34,33.08 7.74,16.44 15.48,32.84 28.36,36.54 12.55,3.57 27.22,-4.45 42.17,-12.63 12.77,-6.96 25.65,-14.04 37.55,-14.04 11.62,0 24.01,7.08 36.33,14.08 15.09,8.61 30.08,17.15 43.42,12.58 13.46,-4.64 21.12,-21 28.71,-37.16 6.06,-12.95 12.12,-25.81 21,-32.45 9.07,-6.81 23.29,-8.86 37.47,-10.94 17.12,-2.48 34.16,-4.95 41.94,-15.69 7.78,-10.82 4.69,-28.64 1.56,-46.41 -2.51,-14.63 -5.07,-29.19 -1.56,-39.85 3.39,-10.38 13.26,-19.98 23.25,-29.73l0 0z\" fill=\"white\" />\n   <path class=\"fil1\" d=\"M99.09 199.74l135.23 -104.22c5.63,-4.36 12.56,-6.7 19.69,-6.7 7.13,0 14.07,2.34 19.69,6.7l135.4 104.07c7.92,6.1 12.59,15.56 12.59,25.59 0,15.17 -10.53,28.28 -25.35,31.53l-5.15 1.15 -13.27 132.31c-1.62,16.48 -15.53,29.04 -32.08,29.04 0,0 0,0 0,0l-27.3 0c-8.91,0 -16.12,-7.21 -16.12,-16.12l0 -80.7c0,-26.74 -21.66,-48.41 -48.4,-48.41 -26.74,0 -48.41,21.67 -48.41,48.41l0 80.7c0,8.91 -7.25,16.12 -16.16,16.12l-27.25 0c0,0 0,0 0,0 -16.56,0 -30.46,-12.56 -32.13,-29.04l-13.23 -132.31 -5.15 -1.15c-14.81,-3.25 -25.39,-16.36 -25.39,-31.53 0,-10.02 4.68,-19.49 12.64,-25.59l0.16 0.15 -0.01 0z\" fill=\"#4E5058\" />\n  </g>\n </g>\n</svg>"};
const logo = '<img class="labcafe-logo" src="/logo.svg" alt="" width="36" height="40">';
// Ready-made Discord APP tag from the same MIT badge collection.
const appTagSvg = "<svg width=\"39\" height=\"15\" viewBox=\"0 0 39 15\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" class=\"app-tag-art\" aria-hidden=\"true\" focusable=\"false\">\n<rect width=\"38.17\" height=\"15\" rx=\"3\" fill=\"#5865F2\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12.2 4.19724C12.3222 4.32186 12.3906 4.4894 12.3906 4.6639C12.3906 4.83841 12.3222 5.00595 12.2 5.13057L6.86667 10.4639C6.74205 10.5861 6.5745 10.6545 6.4 10.6545C6.2255 10.6545 6.05795 10.5861 5.93333 10.4639L3.26667 7.79724C3.19026 7.73993 3.12705 7.66687 3.08133 7.58301C3.03561 7.49915 3.00845 7.40644 3.00168 7.31116C2.99491 7.21589 3.00869 7.12027 3.04209 7.03079C3.07549 6.9413 3.12772 6.86004 3.19526 6.7925C3.2628 6.72496 3.34406 6.67272 3.43355 6.63932C3.52303 6.60593 3.61865 6.59214 3.71393 6.59892C3.8092 6.60569 3.90191 6.63285 3.98577 6.67857C4.06963 6.72429 4.14269 6.78749 4.2 6.8639L6.4 9.05724L11.2667 4.19057C11.3913 4.06842 11.5588 4 11.7333 4C11.9078 4 12.0754 4.06842 12.2 4.19057V4.19724Z\" fill=\"white\"/>\n<path d=\"M15.7 11V4.1H18.75C19.31 4.1 19.76 4.26 20.1 4.58C20.4467 4.9 20.62 5.32333 20.62 5.85C20.62 6.26333 20.52 6.59667 20.32 6.85C20.1267 7.09667 19.87 7.27667 19.55 7.39C19.9567 7.47667 20.2767 7.66 20.51 7.94C20.75 8.21333 20.87 8.59667 20.87 9.09C20.87 9.73 20.6767 10.21 20.29 10.53C19.9033 10.8433 19.3567 11 18.65 11H15.7ZM18.23 6.86C18.8633 6.86 19.18 6.60667 19.18 6.1C19.18 5.59333 18.8633 5.34 18.23 5.34H17.16V6.86H18.23ZM18.3 9.76C19.04 9.76 19.41 9.48333 19.41 8.93C19.41 8.37667 19.04 8.1 18.3 8.1H17.16V9.76H18.3ZM25.0733 11.14C24.4466 11.14 23.8933 10.9967 23.4133 10.71C22.9333 10.4233 22.5599 10.01 22.2933 9.47C22.0266 8.92333 21.8933 8.28333 21.8933 7.55C21.8933 6.81667 22.0266 6.18 22.2933 5.64C22.5599 5.09333 22.9333 4.67667 23.4133 4.39C23.8933 4.10333 24.4466 3.96 25.0733 3.96C25.6999 3.96 26.2533 4.10333 26.7333 4.39C27.2133 4.67667 27.5866 5.09333 27.8533 5.64C28.1199 6.18 28.2533 6.81667 28.2533 7.55C28.2533 8.28333 28.1199 8.92333 27.8533 9.47C27.5866 10.01 27.2133 10.4233 26.7333 10.71C26.2533 10.9967 25.6999 11.14 25.0733 11.14ZM25.0733 9.82C25.6333 9.82 26.0599 9.62667 26.3533 9.24C26.6466 8.84667 26.7933 8.28333 26.7933 7.55C26.7933 6.81667 26.6466 6.25667 26.3533 5.87C26.0599 5.47667 25.6333 5.28 25.0733 5.28C24.5133 5.28 24.0866 5.47667 23.7933 5.87C23.4999 6.25667 23.3533 6.81667 23.3533 7.55C23.3533 8.28333 23.4999 8.84667 23.7933 9.24C24.0866 9.62667 24.5133 9.82 25.0733 9.82ZM32.5483 11H31.0883V5.42H29.0883V4.1H34.5483V5.42H32.5483V11Z\" fill=\"white\"/>\n<rect width=\"38.17\" height=\"15\" rx=\"3\" fill=\"#5865F2\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M12.2 4.19724C12.3222 4.32186 12.3906 4.4894 12.3906 4.6639C12.3906 4.83841 12.3222 5.00595 12.2 5.13057L6.86667 10.4639C6.74205 10.5861 6.5745 10.6545 6.4 10.6545C6.2255 10.6545 6.05795 10.5861 5.93333 10.4639L3.26667 7.79724C3.19026 7.73993 3.12705 7.66687 3.08133 7.58301C3.03561 7.49915 3.00845 7.40644 3.00168 7.31116C2.99491 7.21589 3.00869 7.12027 3.04209 7.03079C3.07549 6.9413 3.12772 6.86004 3.19526 6.7925C3.2628 6.72496 3.34406 6.67272 3.43355 6.63932C3.52303 6.60593 3.61865 6.59214 3.71393 6.59892C3.8092 6.60569 3.90191 6.63285 3.98577 6.67857C4.06963 6.72429 4.14269 6.78749 4.2 6.8639L6.4 9.05724L11.2667 4.19057C11.3913 4.06842 11.5588 4 11.7333 4C11.9078 4 12.0754 4.06842 12.2 4.19057V4.19724Z\" fill=\"white\"/>\n<path d=\"M21.91 11H20.33L19.88 9.68H17.12L16.67 11H15.09L17.7 4.1H19.3L21.91 11ZM18.5 5.67L17.58 8.36H19.42L18.5 5.67ZM23.102 11V4.1H26.192C26.8786 4.1 27.422 4.29667 27.822 4.69C28.2286 5.08333 28.432 5.63667 28.432 6.35C28.432 7.07 28.2286 7.64 27.822 8.06C27.4153 8.47333 26.872 8.68 26.192 8.68H24.562V11H23.102ZM25.922 7.36C26.2553 7.36 26.512 7.28 26.692 7.12C26.8786 6.96 26.972 6.71667 26.972 6.39C26.972 6.06333 26.8786 5.82 26.692 5.66C26.512 5.5 26.2553 5.42 25.922 5.42H24.562V7.36H25.922ZM29.8789 11V4.1H32.9689C33.6556 4.1 34.1989 4.29667 34.5989 4.69C35.0056 5.08333 35.2089 5.63667 35.2089 6.35C35.2089 7.07 35.0056 7.64 34.5989 8.06C34.1922 8.47333 33.6489 8.68 32.9689 8.68H31.3389V11H29.8789ZM32.6989 7.36C33.0322 7.36 33.2889 7.28 33.4689 7.12C33.6556 6.96 33.7489 6.71667 33.7489 6.39C33.7489 6.06333 33.6556 5.82 33.4689 5.66C33.2889 5.5 33.0322 5.42 32.6989 5.42H31.3389V7.36H32.6989Z\" fill=\"white\"/>\n</svg>\n";
const appTag = `<span class="app-badge app-tag" role="img" aria-label="APP">${appTagSvg}</span>`;
const brand = `<span class="brand">${logo}<span>LabCafe</span><span class="beta-tag" aria-label="Beta sürümü">BETA</span></span>`;
function avatar(item, type='guild') {
  const name=item?.name || '?'; const hash=item?.[type==='guild'?'icon':'avatar'];
  const valid=hash && /^\d{17,20}$/.test(item.id) && /^[a-zA-Z0-9_]+$/.test(hash);
  return `<span class="avatar ${type}">${valid ? `<img src="https://cdn.discordapp.com/${type==='guild'?'icons':'avatars'}/${item.id}/${hash}.${hash.startsWith('a_')?'gif':'webp'}?size=128" alt="">` : escape(name.slice(0,2).toUpperCase())}</span>`;
}
let toastTimer;
function toast(text,error=false) {
  const element=document.querySelector('#toast');element.textContent=text;element.className=`toast${error?' error':''}`;element.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.hidden=true,4500);
}
async function api(path,options={}) {
  const response=await fetch(path,{signal:AbortSignal.timeout(12000),...options,credentials:'same-origin',headers:{
    ...(options.body?{'Content-Type':'application/json'}:{}),
    ...(options.method && options.method!=='GET'?{'X-CSRF-Token':state.csrf}:{}),...options.headers
  }});
  const data=await response.json();
  if(!response.ok){const error=new Error(response.status===401?'Oturumun sona erdi. Discord ile tekrar giriş yap.':data.error || 'İşlem tamamlanamadı.');error.status=response.status;error.errorId=/^[a-f0-9]{12}$/.test(data.errorId||'')?data.errorId:null;throw error;}
  return data;
}
function dashboardError(error,retry){
  app.classList.remove('guild-workspace');
  if(!document.querySelector('#content'))app.innerHTML=header(Boolean(state.user))+'<main class="dashboard-main" id="main-content"><div id="content"></div></main>'+footer();
  const status=error.status||0;
  const title=status===401?'Oturumun sona erdi':status===403?'Bu sunucuya erişimin yok':status===404?'Sayfa bulunamadı':status===409?'LabCafe bu sunucuda yok':status===429?'Kısa bir mola verelim':'Sunucuya bağlanamadık';
  const message=status?error.message:'Bağlantı kesilmiş veya yanıt gecikmiş olabilir. Biraz sonra tekrar deneyebilirsin.';
  document.title='LabCafe — '+title;
  document.querySelector('#content').innerHTML=`<div class="error-stage"><section class="error-card" aria-labelledby="error-title"><div class="error-emblem" aria-hidden="true"><img src="/logo.svg" alt="" width="64" height="64"></div><span class="error-code">${status||'BAĞLANTI'}</span><h1 id="error-title" tabindex="-1">${title}</h1><p role="alert">${escape(message)}</p><div class="error-actions">${status===401?'<a class="button primary" href="/auth/login">Discord ile giriş yap</a>':status===403||status===404?'<a class="button primary" href="/dashboard">Sunucularıma git</a>':'<button class="button primary" id="error-retry">Tekrar dene</button>'}<a class="button subtle" href="/">Ana sayfaya dön</a></div>${error.errorId?'<p class="error-reference">Hata kodu: <code>'+escape(error.errorId)+'</code></p>':''}</section></div>`;
  document.querySelector('#error-retry')?.addEventListener('click',()=>{const button=document.querySelector('#error-retry');button.disabled=true;buttonBusy(button,true,'Tekrar deneniyor…');retry();});
  document.querySelector('#error-title').focus();
}
function coffeeLoader(label='Veriler alınıyor…',inline=false){
 const text=window.LabCafeLanguage?.text(label)||label;
 return `<span class="soft-loader${inline?' soft-loader-inline':''}" role="status" aria-label="${escape(text)}"><span class="soft-loader-visual" aria-hidden="true">${inline?'':'<img src="/logo.svg" alt="" width="38" height="43">'}<span class="soft-loader-track"></span></span></span>`;
}
function dashboardSkeleton(kind='overview'){
 const label=window.LabCafeLanguage?.text('Sunucu yükleniyor…')||'Sunucu yükleniyor…';
 const line='<span class="loading-placeholder loading-line"></span>';
 if(kind==='guilds')return `<section class="dashboard-skeleton" role="status" aria-label="${escape(label)}"><div class="page-title" aria-hidden="true"><span class="loading-placeholder loading-title"></span></div><div class="guild-grid" aria-hidden="true">${Array.from({length:6},()=>'<div class="guild-card skeleton-guild"><span class="loading-placeholder loading-avatar"></span>'+line+'</div>').join('')}</div></section>`;
 const cards=()=>`<div class="workspace-module-grid">${Array.from({length:2},()=>'<div class="workspace-module-card skeleton-module"><span class="loading-placeholder loading-square"></span><span class="loading-copy-lines">'+line+line+'</span></div>').join('')}</div>`;
 return `<section class="dashboard-skeleton guild-workspace-layout" role="status" aria-label="${escape(label)}"><aside class="guild-sidebar skeleton-sidebar" aria-hidden="true"><span class="loading-placeholder loading-server"></span>${line.repeat(5)}</aside><div class="guild-workspace-body" aria-hidden="true"><div class="workspace-page"><div class="workspace-welcome"><span class="loading-placeholder loading-title"></span></div><div class="workspace-summary">${Array.from({length:3},()=>'<div>'+line+'<span class="loading-placeholder loading-value"></span></div>').join('')}</div>${Array.from({length:2},()=>'<section class="workspace-module-group">'+line+cards()+'</section>').join('')}</div></div></section>`;
}
const busyButtons=new WeakMap();
function buttonBusy(button,busy,label='Veriler alınıyor…'){
 if(!button)return;
 if(busy){if(!busyButtons.has(button))busyButtons.set(button,{html:button.innerHTML,label:button.getAttribute('aria-label'),minWidth:button.style.minWidth});button.style.minWidth=Math.max(button.getBoundingClientRect().width,24)+'px';button.innerHTML=coffeeLoader(label,true);button.setAttribute('aria-label',window.LabCafeLanguage?.text(label)||label);button.setAttribute('aria-busy','true');}
 else {const previous=busyButtons.get(button);if(previous){button.innerHTML=previous.html;button.style.minWidth=previous.minWidth;if(previous.label===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',previous.label);busyButtons.delete(button);}button.removeAttribute('aria-busy');}
}
function dirty(){return state.draft && JSON.stringify(state.draft)!==JSON.stringify(state.settings);}
function canLeave(){return !state.saving && (!dirty() || confirm(window.LabCafeLanguage?.text('Kaydedilmemiş değişiklikler silinsin mi?')||'Kaydedilmemiş değişiklikler silinsin mi?'));}
function guildStatus(guild) {
  if(guild?.verified)return {kind:'verified',title:'Doğrulanmış sunucu',label:'Destek'};
  if(guild?.partnered)return {kind:'partnered',title:'Discord ortağı',label:'Destek'};
  if(guild?.community)return {kind:'community',title:'Topluluk sunucusu',label:'Topluluk'};
  return null;
}
function guildBadge(guild) {
  const status=guildStatus(guild);
  return status?`<span class="guild-status" title="${status.title}" role="img" aria-label="${status.title}">${guildBadges[status.kind]}</span>`:'';
}
function getSupportGuild() {
  return state.supportGuildId?state.publicGuilds.find(item=>item.id===state.supportGuildId):state.publicGuildCount===1?state.publicGuilds[0]:null;
}
function loginServerCard() {
  const guild=getSupportGuild();
  return `<div class="login-server-card">${guild?avatar(guild):logo}<div class="login-server-copy"><strong>${guildBadge(guild)}<span>${escape(guild?.name || 'LabCafe')}</span></strong><p>Discord sunucumuza katılmak ister misin?</p></div></div>`;
}
function loginPrompt() {
  return `<dialog class="login-dialog" id="login-dialog" aria-labelledby="login-dialog-title"><button class="login-dialog-close icon-button" data-close="login-dialog" aria-label="Kapat">${icon('close')}</button><h2 id="login-dialog-title">Discord ile Giriş Yap</h2><div id="login-support-guild">${loginServerCard()}</div><div class="dialog-actions"><a class="button" href="/auth/login" data-login-direct>Hayır, yalnızca giriş yap</a><button class="button" id="login-join"${state.supportInviteUrl?'':' disabled'}>Evet, lütfen</button></div></dialog>`;
}
function supportMenuContent() {
  const guild=getSupportGuild();
  const status=guildStatus(guild);
  return `<span>${status?.label || 'Destek'}</span>${guildBadge(guild)}`;
}
function supportMenuLink() {
  const content=supportMenuContent();
  return state.supportInviteUrl?`<a class="support-nav" data-support href="${escape(state.supportInviteUrl)}">${content}</a>`:`<button class="support-nav" data-support>${content}</button>`;
}
function updateSupportMenu() {
  document.querySelectorAll('[data-support]').forEach(button=>{button.innerHTML=supportMenuContent();});
  const card=document.querySelector('#login-support-guild');if(card)card.innerHTML=loginServerCard();
}
const accountIcons = {"account-settings":"<svg class=\"icon\" aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M14 17H5\" />\n  <path d=\"M19 7h-9\" />\n  <circle cx=\"17\" cy=\"17\" r=\"3\" />\n  <circle cx=\"7\" cy=\"7\" r=\"3\" />\n</svg>\n","account-panel":"<svg class=\"icon\" aria-hidden=\"true\" focusable=\"false\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\" />\n  <rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\" />\n  <rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\" />\n  <rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\" />\n</svg>\n"};
function navigationDrawing(){return '';}
const featurePages = {"dashboard":{"title":"Yönetim Paneli","intro":"Sunucunun ayarları, tek bir yerde.","description":"Discord ile giriş yap, yönetebildiğin sunucuyu seç ve LabCafe ayarlarını kontrol et.","items":[["Sunucunu seç","Sunucu sahibi veya Sunucuyu Yönet yetkisine sahip olduğun sunucuları gör. Botun ekli olduğu sunucular önce listelenir."],["İncele ve onayla","Yanıt görünürlüğünü, komut kanalını ve bot dilini düzenle. Kaydetmeden önce değişikliklerini inceleyip onayla."],["Geçmişini takip et","Ayar değişikliklerini, tarihini ve işlemi yapan hesabı gör."]],"note":"Dashboard ve Discord’daki /ayarlar komutu aynı sunucu ayarlarını kullanır."},"server-checks":{"title":"Sunucu Kontrolleri","intro":"Karar vermeden önce sunucunu tanı.","description":"LabCafe, mevcut kanal ve rol bilgilerini temel kurallarla kontrol eder. Sonucu panelinde inceleyebilirsin.","items":[["Kanallar ve kategoriler","Silinmiş komut kanalı, boş kategoriler ve kategorisiz kanallar gibi düzen noktalarını gör."],["Roller ve izinler","@everyone rolündeki yüksek etkili izinleri ve yönetici yetkisi taşıyan normal rolleri fark et."],["Kontrol sende","Kontroller kanal, rol veya izin değiştirmez."]],"note":"Mevcut analiz kurallara dayanır. Kapsamlı yapay zekâ analizi ve onaylı toplu Discord işlemleri henüz kullanıma açık değildir."},"commands":{"title":"Bot Komutları","intro":"Komutların belli, kontrolün sende.","description":"Temel komutlarla LabCafe’yi tanı; yardım menüsünden komutları keşfet ve sunucuna uygun erişimi düzenle.","items":[["Temel komutlar","/yardım ile kategorileri ve komut aramasını aç. /ping bağlantıyı, /bilgi bot bilgisini, /kurulum başlangıç adımlarını gösterir."],["Sunucu ayarları","/ayarlar ile yanıt görünürlüğünü, komut kanalını ve dili yönet. Ayarlar için Sunucuyu Yönet yetkisi gerekir."],["Komut erişimi","Yardım menüsündeki Düzenle üzerinden komutu açıp kapat; rol ve kanal izinlerini belirle. Yönetme yetkisi her işlemde kontrol edilir."]],"note":"Komutları kullanmak için botun sunucunda bulunması ve hesabının ilgili erişim koşullarını karşılaması gerekir."}};
function featurePage(key){
 const page=featurePages[key];if(!page)return;
 document.title='LabCafe — '+page.title;
 app.innerHTML=`${header(Boolean(state.user))}<main id="main-content" class="feature-page"><a class="feature-back" href="/">← Ana Sayfa</a><section class="feature-hero"><div><h1>${page.intro}</h1><p>${page.description}</p><div class="landing-actions"><a class="button primary" href="/dashboard">Yönetim Panelini Aç</a><a class="button" href="${inviteUrl()}" target="_blank" rel="noopener noreferrer">${icon('discord')} LabCafe’yi Ekle</a></div></div><div class="feature-illustration">${navigationDrawing(key==='commands'?'resources':'features')}</div></section><section class="feature-explanations" aria-label="Özellik detayları">${page.items.map(([title,text],i)=>`<article><span>0${i+1}</span><h2>${title}</h2><p>${text}</p></article>`).join('')}</section><p class="feature-scope">${icon('info')}<span>${page.note}</span></p><nav class="feature-related" aria-label="Diğer özellikler">${Object.entries(featurePages).filter(([name])=>name!==key).map(([name,value])=>`<a href="/features/${name}">${value.title} ${icon('chevron')}</a>`).join('')}</nav></main>${footer()}${dialogs()}`;bindShell();void loadPublicGuilds();
}
function navigationGroups(prefix){
  const item=(href,name,description,glyph)=>`<a class="nav-card" href="${href}">${icon(glyph)}<span><strong>${name}</strong><small>${description}</small></span></a>`;
  const features=item('/features/dashboard','Yönetim Paneli','Sunucunu seç, ayarlarını yönet.','menu')+item('/features/server-checks','Sunucu Kontrolleri','Kanal, rol ve izin kontrollerini incele.','shield')+item('/features/commands','Bot Komutları','Sunucunu seçerek komutlarını düzenle.','terminal');
  const resources=item('/terms-of-service','Hizmet Koşulları','LabCafe kullanım koşulları.','check')+item('/privacy-policy','Gizlilik Politikası','Verilerini nasıl işlediğimizi öğren.','shield')+item('/data-deletion','Veri Silme','Kayıtlarının silinmesini talep et.','refresh');
  return [['features','Özellikler',features],['resources','Kaynaklar',resources]].map(([key,label,items])=>`<div class="nav-group"><button class="nav-trigger" data-nav-toggle aria-expanded="false" aria-controls="${prefix}-${key}">${label}${icon('down')}</button><div class="nav-panel" id="${prefix}-${key}" hidden><div class="nav-main"><p class="nav-caption">${label}</p><div class="nav-card-grid">${items}</div></div><aside class="nav-start">${navigationDrawing(key)}<a href="${key==='features'?'/dashboard':'/privacy-policy'}" class="nav-start-link">${key==='features'?'Yönetim panelini aç':'Gizlilik politikasını oku'} ${icon('chevron')}</a></aside></div></div>`).join('');
}
function languageFlag(language){
 const art=language==='tr'?'<rect width="24" height="24" fill="#e5303e"/><circle cx="10" cy="12" r="6" fill="#fff"/><circle cx="12" cy="11" r="5" fill="#e5303e"/><path d="m17 8 1 2.7 2.9.1-2.3 1.8.8 2.8-2.4-1.6-2.4 1.6.8-2.8-2.3-1.8 2.9-.1Z" fill="#fff"/>':'<rect width="24" height="24" fill="#fff"/><path d="M0 1.5H24M0 5.2H24M0 8.9H24M0 12.6H24M0 16.3H24M0 20H24M0 23.7H24" stroke="#c73c4b" stroke-width="1.9"/><rect width="13" height="13" fill="#344777"/><path d="M3 3h1M7 3h1M11 3h1M3 7h1M7 7h1M11 7h1M3 11h1M7 11h1M11 11h1" stroke="#fff" stroke-width="1.3"/>';
 return `<span class="language-flag" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${art}</svg></span>`;
}
function header(authenticated) {
  return `<a class="skip-link" href="#main-content">Ana içeriğe git</a><header class="site-header"><div class="header-left"><a href="/" aria-label="LabCafe ana sayfa">${brand}</a><nav class="desktop-nav" aria-label="Ana menü">${navigationGroups('desktop')}${supportMenuLink()}</nav></div><div class="header-right"><div class="language-control"><button class="language-button" data-language-toggle aria-label="Dil seç" aria-expanded="false" aria-controls="language-menu"><span data-language-current><span data-current-flag="tr">${languageFlag('tr')}</span><span data-current-flag="en" hidden>${languageFlag('en')}</span></span></button><div class="language-menu" id="language-menu" hidden><button data-language="tr" lang="tr">${languageFlag('tr')}<span class="language-name">Türkçe</span><span class="language-check" data-language-check="tr"></span></button><button data-language="en" lang="en">${languageFlag('en')}<span class="language-name">English</span><span class="language-check" data-language-check="en"></span></button></div></div>${authenticated?`<button class="account-button" id="account-button" aria-label="Profil menüsü: @${escape(state.user.name)}" aria-expanded="false" aria-controls="account-dropdown">${avatar(state.user,'user')}<span>@${escape(state.user.name)}</span></button>`:`<a class="button login-button" href="/auth/login" aria-label="Discord ile Giriş Yap">${icon('discord')}<span class="login-label">Discord ile Giriş Yap</span></a>`}<button class="icon-button mobile-menu" id="mobile-menu" aria-label="Menüyü aç" aria-expanded="false" aria-controls="header-dropdown">${icon('menu')}</button></div></header>
  ${authenticated?`<nav class="account-dropdown" id="account-dropdown" aria-label="Hesap menüsü" hidden><a href="/dashboard">${accountIcons['account-panel']}<span>Yönetim Panelini Aç</span></a>${state.isOwner?`<a href="/admin">${accountIcons['account-settings']}<span>LabCafe Yönetimi</span></a>`:''}<div class="account-divider"></div><button id="logout">${icon('logout')}<span>Çıkış Yap</span></button></nav>`:''}
  <nav class="header-dropdown" id="header-dropdown" aria-label="Gezinme menüsü" hidden>${navigationGroups('mobile')}${supportMenuLink()}</nav>`;
}
function footer(){return `<footer class="site-footer"><div class="footer-coffee" aria-hidden="true"><svg class="coffee-surface" viewBox="0 0 1440 160" preserveAspectRatio="none"><defs><linearGradient id="coffee-depth" gradientUnits="userSpaceOnUse" x1="0" y1="55" x2="0" y2="140"><stop offset="0" stop-color="#5c4030"/><stop offset="1" stop-color="#2b211c"/></linearGradient></defs><g class="coffee-flow"><path class="coffee-back" d="M-80 84C110 115 215 16 442 53S777 121 981 66S1268 25 1520 71V180H-80Z"/><path class="coffee-milk" d="M-80 91C125 116 260 30 469 60S779 129 998 76S1310 37 1520 80L1520 100C1305 57 1220 66 1008 96S682 125 477 81S121 138-80 112Z"/><path class="coffee-middle" d="M-80 101C127 125 278 42 474 72S785 139 1005 88S1322 51 1520 92V180H-80Z"/><path class="coffee-ribbon" d="M-80 108C143 134 288 52 489 83S795 143 1018 98S1318 66 1520 103L1520 120C1320 83 1233 86 1025 115S694 143 494 101S145 152-80 126Z"/><path class="coffee-front" d="M-80 119C147 135 279 64 493 94S797 149 1022 109S1315 77 1520 113V180H-80Z"/><path class="coffee-crema" d="M86 118C238 99 324 78 446 88M1027 108C1143 87 1240 85 1324 94"/></g></svg></div><div class="footer-content"><a href="/" aria-label="LabCafe">${logo}<strong>LabCafe</strong></a><nav class="footer-links" aria-label="Yasal bilgiler"><a href="/terms-of-service">Hizmet Koşulları</a><a href="/privacy-policy">Gizlilik Politikası</a><a href="/data-deletion">Veri Silme</a></nav><p>LabCafe · Discord ile bağlantılı bağımsız bir bot.</p></div></footer>`;}
function dialogs(){return `<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Ayarlar sıfırlansın mı?</h2><p>Bu sunucuda gizli yanıtlar açılır, komut kanalı kısıtlaması kaldırılır ve bot dili Türkçeye döner.</p><div class="dialog-actions"><button class="button" data-close="reset-dialog">Vazgeç</button><button class="button danger" id="confirm-reset">Sıfırla</button></div></dialog><dialog id="support-dialog" aria-labelledby="support-title"><h2 id="support-title">LabCafe Destek</h2><p>Kurulum ve ayarlar için destek al.</p>${state.supportInviteUrl?`<a class="button" href="${escape(state.supportInviteUrl)}" target="_blank" rel="noopener noreferrer">Sunucuya Katıl</a>`:'<p>Destek sunucusu bağlantısı henüz eklenmedi.</p>'}<div class="dialog-actions"><button class="button" data-close="support-dialog">Kapat</button></div></dialog>${loginPrompt()}<dialog id="save-confirm" aria-labelledby="save-confirm-title"><h2 id="save-confirm-title">Değişiklikleri incele</h2><div id="save-diff"></div><p>Yalnızca bu sunucunun bot ayarları güncellenecek. Kanal veya rol oluşturulmaz.</p><div class="dialog-actions"><button class="button" data-close="save-confirm">Vazgeç</button><button class="button primary" id="confirm-save">Onayla ve Kaydet</button></div></dialog>`;}
function shell(){
  app.classList.toggle('guild-workspace',Boolean(state.guild));
  app.innerHTML=`${header(true)}<main class="dashboard-main" id="main-content"><div id="content"></div></div></main>${footer()}<div class="save-bar" id="save-bar" hidden><span>Dikkat - kaydedilmemiş değişiklikler var!</span><div><button class="button" id="discard">Sıfırla</button><a class="button" id="save-login" href="/auth/login" hidden>Yeniden giriş yap</a><button class="button primary" id="save">Değişiklikleri Kaydet</button></div></div>${dialogs()}`;
  bindShell();
}
const menuAnimations=new WeakMap();
function toggleMenuPanel(panel,open){
  if(!panel)return;
  const hidden=panel.hidden;
  const current=hidden?{opacity:0,transform:'translateY(-3px)'}:{opacity:getComputedStyle(panel).opacity,transform:getComputedStyle(panel).transform};
  menuAnimations.get(panel)?.cancel();
  panel.inert=!open;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){panel.hidden=!open;return;}
  if(hidden&&!open)return;
  panel.hidden=false;
  const animation=panel.animate([current,open?{opacity:1,transform:'translateY(0)'}:{opacity:0,transform:'translateY(-3px)'}],{duration:150,easing:'cubic-bezier(.2,.7,.3,1)'});
  menuAnimations.set(panel,animation);
  animation.onfinish=()=>{if(menuAnimations.get(panel)===animation){panel.hidden=!open;menuAnimations.delete(panel);}};
}
function closeNavGroups(except){
  document.querySelectorAll('[data-nav-toggle]').forEach(button=>{if(button===except)return;button.setAttribute('aria-expanded','false');toggleMenuPanel(document.getElementById(button.getAttribute('aria-controls')),false);});
}
function setDropdownOpen(open, kind='navigation') {
  closeNavGroups();
  toggleMenuPanel(document.getElementById('language-menu'),false);
  document.querySelector('[data-language-toggle]')?.setAttribute('aria-expanded','false');
  if(open && kind==='account'){
    const button=document.getElementById('account-button');
    const panel=document.getElementById('account-dropdown');
    if(button&&panel){
      const rect=button.getBoundingClientRect();
      panel.style.top=`${rect.bottom+window.scrollY+8}px`;
      panel.style.right=`${Math.max(16,document.documentElement.clientWidth-rect.right)}px`;
    }
  }
  for(const [id,button] of [['header-dropdown','mobile-menu'],['account-dropdown','account-button']]){
    const selected=(kind==='account'?id==='account-dropdown':id==='header-dropdown');
    toggleMenuPanel(document.getElementById(id),open&&selected);
    document.getElementById(button)?.setAttribute('aria-expanded',String(open&&selected));
  }
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    const languageButton=document.querySelector('[data-language-toggle][aria-expanded="true"]');
    if(languageButton){setDropdownOpen(false);languageButton.focus();return;}
    const account=document.querySelector('#account-dropdown');
    const navButton=document.querySelector('[data-nav-toggle][aria-expanded="true"]');
    const target=navButton?.id || (account&&!account.hidden?'account-button':'mobile-menu');
    if(navButton){setDropdownOpen(false);navButton.focus();return;}
    const opened=Boolean(document.querySelector('#account-dropdown:not([hidden]),#header-dropdown:not([hidden])'));
    setDropdownOpen(false);
    if(opened)document.getElementById(target)?.focus();
  }
});
document.addEventListener('click',event=>{
  if(!event.target.closest('.nav-group,.language-control,#account-dropdown,#header-dropdown,#mobile-menu,#account-button'))setDropdownOpen(false);
});
window.addEventListener('resize',()=>setDropdownOpen(false));
let navResizeObserver;
function bindShell(){
  navResizeObserver?.disconnect();
  document.querySelector('[data-language-toggle]')?.addEventListener('click',()=>{
    const button=document.querySelector('[data-language-toggle]');const open=button.getAttribute('aria-expanded')!=='true';setDropdownOpen(false);button.setAttribute('aria-expanded',String(open));toggleMenuPanel(document.querySelector('#language-menu'),open);
  });
  document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{if(canLeave())window.LabCafeLanguage?.set(button.dataset.language);}));
  window.LabCafeLanguage?.refresh();
  document.querySelectorAll('[data-nav-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const open=button.getAttribute('aria-expanded')!=='true';
    closeNavGroups(button);toggleMenuPanel(document.querySelector('#language-menu'),false);document.querySelector('[data-language-toggle]')?.setAttribute('aria-expanded','false');
    if(button.closest('.desktop-nav')){toggleMenuPanel(document.getElementById('account-dropdown'),false);document.getElementById('account-button')?.setAttribute('aria-expanded','false');}
    button.setAttribute('aria-expanded',String(open));
    toggleMenuPanel(document.getElementById(button.getAttribute('aria-controls')),open);
  }));
  document.querySelectorAll('.nav-card,.nav-start a').forEach(link=>link.addEventListener('click',event=>{if(!canLeave()){event.preventDefault();return;}setDropdownOpen(false);}));
  const nav=document.querySelector('.desktop-nav');
  if(nav){
    let navTarget=null;
    const highlight=target=>{
      if(!target || target.parentElement!==nav)return;
      navTarget=target;
      nav.style.setProperty('--nav-x',`${target.offsetLeft}px`);
      nav.style.setProperty('--nav-y',`${target.offsetTop}px`);
      nav.style.setProperty('--nav-width',`${target.offsetWidth}px`);
      nav.style.setProperty('--nav-height',`${target.offsetHeight}px`);
      nav.dataset.highlight='visible';
    };
    nav.addEventListener('pointerover',event=>highlight(event.target.closest('button,a')));
    nav.addEventListener('pointerleave',()=>{
      if(nav.contains(document.activeElement))highlight(document.activeElement);
      else{delete nav.dataset.highlight;navTarget=null;}
    });
    nav.addEventListener('focusin',event=>highlight(event.target));
    nav.addEventListener('focusout',event=>{
      if(!nav.contains(event.relatedTarget) && !nav.matches(':hover')){delete nav.dataset.highlight;navTarget=null;}
    });
    // Reposition after a real guild badge changes the support button's width.
    navResizeObserver=new ResizeObserver(()=>{if(navTarget?.isConnected)highlight(navTarget);});
    navResizeObserver.observe(nav);
  }

  for(const [id,panel,kind] of [['mobile-menu','header-dropdown','navigation'],['account-button','account-dropdown','account']])document.getElementById(id)?.addEventListener('click',()=>{
    setDropdownOpen(document.getElementById(id).getAttribute('aria-expanded')!=='true',kind);
  });
  document.querySelectorAll('#account-dropdown a').forEach(link=>link.addEventListener('click',event=>{
    if(!canLeave())event.preventDefault();
  }));
  document.querySelectorAll('[data-guilds]').forEach(button=>button.addEventListener('click',()=>{if(state.user && canLeave()){if(location.pathname!=='/dashboard')location.href='/dashboard';else showGuilds();}else if(!state.user)location.href='/auth/login';}));
  document.querySelectorAll('[data-commands]').forEach(button=>button.addEventListener('click',()=>{
    if(!state.guild){toast('Önce bir sunucu seç.');return;}setDropdownOpen(false);state.view='commands';renderContent();
  }));
  for(const name of ['premium','support'])document.querySelectorAll(name==='support'?'button[data-support]':'[data-premium]').forEach(button=>button.addEventListener('click',()=>{
    setDropdownOpen(false);
    document.querySelector(`#${name}-dialog`).showModal();
  }));
  document.querySelectorAll('a[href="/auth/login"]:not([data-login-direct])').forEach(link=>link.addEventListener('click',event=>{
    if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    event.preventDefault();setDropdownOpen(false);
    document.querySelector('#login-support-guild').innerHTML=loginServerCard();
    document.querySelector('#login-dialog').showModal();
  }));
  document.querySelector('#login-join')?.addEventListener('click',()=>{
    if(!state.supportInviteUrl)return;
    window.open(state.supportInviteUrl,'_blank','noopener,noreferrer');
    location.assign('/auth/login');
  });
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.close).close()));
  document.querySelector('#logout')?.addEventListener('click',async()=>{
    if(!canLeave())return;
    try{await api('/api/logout',{method:'POST'});location.href='/';}catch(error){toast(error.message,true);}
  });
  document.querySelector('#discard')?.addEventListener('click',()=>{state.saveError=false;state.draft={...state.settings};renderContent();});
  document.querySelector('#save')?.addEventListener('click',()=>{
    if(!dirty()||state.saving)return;
    const changes=[];
    if(state.settings.locale!==state.draft.locale)changes.push(`Dil: ${state.settings.locale==='en'?'English':'Türkçe'} → ${state.draft.locale==='en'?'English':'Türkçe'}`);
    const channelName=id=>id?'#'+(state.guild.channels.find(c=>c.id===id)?.name||'erişilemeyen-kanal'):'Tüm kanallar';
    if(state.settings.ephemeralReplies!==state.draft.ephemeralReplies)changes.push(`Yanıtlar: ${state.settings.ephemeralReplies?'Gizli':'Herkese açık'} → ${state.draft.ephemeralReplies?'Gizli':'Herkese açık'}`);
    if(state.settings.commandChannelId!==state.draft.commandChannelId)changes.push(`Komut kanalı: ${channelName(state.settings.commandChannelId)} → ${channelName(state.draft.commandChannelId)}`);
    document.querySelector('#save-diff').innerHTML=changes.map(text=>`<p>${escape(text)}</p>`).join('');
    document.querySelector('#save-confirm').showModal();
  });
  document.querySelector('#confirm-save')?.addEventListener('click',()=>{document.querySelector('#save-confirm').close();void save();});
  document.querySelector('#confirm-reset')?.addEventListener('click',reset);
}
function breadcrumbs(selected=false,commands=false){
  return `<nav class="breadcrumbs" aria-label="Sayfa yolu"><a href="/" aria-label="Başlangıç Sayfası">Başlangıç Sayfası</a>${icon('chevron')}${selected?'<button id="back-guilds">Sunucu Seçimi</button>':'<span aria-current="page">Sunucu Seçimi</span>'}${selected?`${icon('chevron')}<span aria-current="page">${commands?'Komutlar':'Sunucu Ayarları'}</span>`:''}</nav>`;
}
function showGuilds(updateURL=true){
  if(updateURL&&location.pathname==='/dashboard'&&location.search)history.pushState({},'','/dashboard');
  document.title='LabCafe — Sunucu Seçimi';
  state.navigation++;state.saveError=false;
  state.guilds.sort((a,b)=>Number(b.botPresent===true)-Number(a.botPresent===true));
  state.guild=null;state.settings=null;state.draft=null;state.view='guilds';shell();
  document.querySelector('#content').innerHTML=`${breadcrumbs()}<div class="page-title"><h1>${avatar(state.user,'user')}Merhaba, ${escape(state.user.name)}!</h1></div><div class="guild-grid">${state.guilds.map(guild=>`<button class="guild-card${guild.botPresent===false||guild.betaAllowed===false?' bot-absent':''}" title="${escape(guild.name)}${guild.betaAllowed===false?' · Beta erişimi yok':guild.botPresent===false?' · LabCafe ekli değil':''}" data-guild="${escape(guild.id)}">${avatar(guild)}<strong>${escape(guild.name)}</strong></button>`).join('')}</div>${state.guilds.length?'':'<div class="empty-state"><h2>Yönetilebilir sunucu bulunamadı.</h2><p>Sunucu sahibi veya Sunucuyu Yönet yetkisine sahip olmalısın.</p></div>'}<div class="guild-actions"><a class="button primary" href="${inviteUrl()}" target="_blank" rel="noopener noreferrer">${icon('discord')} LabCafe’yi Ekle</a><button class="button icon-only" id="refresh-guilds" aria-label="Sunucuları yenile">${icon('refresh')}</button></div>`;
  document.querySelectorAll('[data-guild]').forEach(button=>button.addEventListener('click',()=>selectGuild(button.dataset.guild)));
  document.querySelector('#refresh-guilds').addEventListener('click',async event=>{
    const refresh=event.currentTarget;refresh.disabled=true;buttonBusy(refresh,true);try{state.guilds=(await api('/api/guilds')).guilds;showGuilds();focusContent();}catch(error){toast(error.message,true);refresh.disabled=false;buttonBusy(refresh,false);}
  });
}
function inviteUrl(id){
  if(state.installFlowEnabled)return '/auth/install'+(id?'?guild='+encodeURIComponent(id):'');
  const params=new URLSearchParams({client_id:state.clientId,scope:'bot applications.commands',permissions:'19456'});
  if(id){params.set('guild_id',id);params.set('disable_guild_select','true');}
  return `https://discord.com/oauth2/authorize?${params}`;
}
async function selectGuild(id){
  const listed=state.guilds.find(guild=>guild.id===id);
  if(listed?.betaAllowed===false){toast('Bu sunucu henüz kapalı beta listesinde değil.',true);return;}
  if(listed?.botPresent===false){
    document.querySelector('#content').innerHTML=`${breadcrumbs(true)}<h1>LabCafe bu sunucuda yok</h1><p>Botu ekledikten sonra sunucu listesini yenile.</p><a class="button primary" href="${inviteUrl(id)}" target="_blank" rel="noopener noreferrer">Botu sunucuya ekle</a><button class="button" id="back-guilds">Sunuculara dön</button>`;
    document.querySelector('#back-guilds').addEventListener('click',showGuilds);return;
  }
  const navigation=++state.navigation;state.saveError=false;
  document.querySelector('#content').innerHTML=dashboardSkeleton();
  try{
    window.labcafeTrack?.('analysis_started');
    const data=await api(`/api/guilds/${id}`);
    if(data.analysis)window.labcafeTrack?.('analysis_completed');
    if(navigation!==state.navigation)return;
    window.labcafeTrack?.('server_selected');
    state.analysis=data.analysis;state.history=data.history||[];state.guild=data.guild;state.settings=data.settings;state.draft={...data.settings};state.commands=data.commands;
    const params=new URLSearchParams(location.search);state.view=params.get('guild')===id&&['settings','commands','checks','history'].includes(params.get('view'))?params.get('view'):'overview';if(params.get('guild')!==id)history.pushState({},'',`/dashboard?guild=${id}`);shell();renderContent();focusContent();
  }catch(error){
    if(navigation!==state.navigation)return;
    dashboardError(error,()=>{void selectGuild(id);});
  }
}
function settingsFields(){
 const missing=state.draft.commandChannelId&&!state.guild.channels.some(channel=>channel.id===state.draft.commandChannelId);
 return `<section class="settings-fields" aria-label="Sunucu ayarları"><section class="module-panel"><h2>Genel</h2><div class="field-group"><label for="bot-language">Bot Dili</label><div class="select-wrap"><select id="bot-language"><option value="tr">Türkçe</option><option value="en">English</option></select>${icon('down')}</div><p>Sunucudaki bot yanıtlarının dilini seç.</p></div></section><section class="module-panel"><h2>Komut Davranışı</h2><div class="field-group"><label for="reply-visibility">Yanıt Görünürlüğü</label><div class="select-wrap"><select id="reply-visibility"><option value="gizli">Gizli</option><option value="acik">Herkese açık</option></select>${icon('down')}</div></div><div class="field-group"><label for="command-channel">Komut Kanalı</label><div class="select-wrap"><select id="command-channel"><option value="">Tüm kanallar</option>${missing?'<option value="'+escape(state.draft.commandChannelId)+'">Kanal bulunamadı — yeniden seç</option>':''}${state.guild.channels.map(channel=>'<option data-user-content value="'+escape(channel.id)+'"># '+escape(channel.name)+'</option>').join('')}</select>${icon('down')}</div><p>/ayarlar bu kısıtlamadan etkilenmez.</p></div></section><div class="module-footer"><button class="button subtle" id="reset">${icon('refresh')} Ayarları sıfırla</button></div></section>`;
}
function insightsPanel(){
  const analysis=state.analysis;
  return `<section class="insights-panel" aria-label="Sunucu kontrolü"><h2>Sunucu kontrolü</h2><p class="section-description">Discord kanal, rol, izin ve kayıtlı bot ayarlarından alınan kontroller. Sunucunda değişiklik yapılmaz.</p>${analysis?`<p>${analysis.textChannelCount} metin kanalı${analysis.roleCount!==undefined?` · ${analysis.roleCount} rol`:""} · ${analysis.commandCount} komut</p><ul class="check-list">${analysis.checks.map(check=>`<li><strong>${escape(check.label)}</strong><span>${check.status==='info'?'Bilgi':check.ok===null?'Kontrol edilmedi':check.ok?'Uygun':'Dikkat gerekiyor'}</span><p>${escape(check.detail)}</p></li>`).join('')}</ul><p class="section-description">Kontrol: ${escape(new Date(analysis.checkedAt).toLocaleString('tr-TR'))}</p>`:'<p>Kontrol bilgisi alınamadı.</p>'}<h2 class="history-title">İşlem geçmişi</h2><p class="section-description">Son 20 ayar işlemi.</p>${state.history.length?`<ol class="history-list">${state.history.map(item=>`<li><strong>${item.action==='reset'?'Ayarlar sıfırlandı':item.action.startsWith('command-access:')?'Komut erişimi güncellendi':'Ayarlar güncellendi'}</strong><p>${escape(new Date(item.changedAt).toLocaleString('tr-TR'))} · <code>${escape(item.actorId)}</code></p></li>`).join('')}</ol>`:'<p>Henüz kayıtlı işlem yok.</p>'}</section>`;
}
function focusContent(){const title=document.querySelector('#content h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
const guildModules=[
 {view:'settings',title:'Bot Ayarları',description:'Bot dilini, yanıt görünürlüğünü ve komut kanalını düzenle.',symbol:'settings',group:'Sunucu Yönetimi'},
 {view:'commands',title:'Komutlar',description:'Kullanılabilir komutlar ve erişim koşulları.',symbol:'terminal',group:'Sunucu Yönetimi'},
 {view:'checks',title:'Sunucu Kontrolü',description:'Kanal düzenini, rolleri ve bot izinlerini gözden geçir.',symbol:'shield',group:'Kontrol ve Kayıtlar'},
 {view:'history',title:'İşlem Geçmişi',description:'Ayar değişiklikleri ve işlem zamanları.',symbol:'refresh',group:'Kontrol ve Kayıtlar'}
];
function guildWorkspaceSidebar(){
 const nav=(view,title,symbol)=>`<button class="${view==='overview'?'workspace-nav-home':'workspace-nav-item'}" data-workspace-view="${view}" ${state.view===view?'aria-current="page"':''}>${icon(symbol)}<span>${title}</span></button>`;
 return `<aside class="guild-sidebar" aria-label="Sunucu menüsü"><label class="sidebar-server-picker">${avatar(state.guild)}<span class="sr-only">Sunucu değiştir</span><select id="workspace-guild" aria-label="Sunucu değiştir">${state.guilds.map(guild=>`<option data-user-content value="${escape(guild.id)}" ${guild.id===state.guild.id?'selected':''} ${guild.botPresent===false||guild.betaAllowed===false?'disabled':''}>${escape(guild.name)}</option>`).join('')}</select></label><nav>${nav('overview','Kontrol Paneli','grid')}${['Sunucu Yönetimi','Kontrol ve Kayıtlar'].map(group=>'<p class="guild-nav-label">'+group+'</p>'+guildModules.filter(item=>item.group===group).map(item=>nav(item.view,item.title,item.symbol)).join('')).join('')}</nav></aside>`;
}
function guildWorkspaceOverview(){
 const cards=group=>guildModules.filter(item=>item.group===group).map(item=>`<button class="workspace-module-card" data-workspace-view="${item.view}"><span class="workspace-module-icon">${icon(item.symbol)}</span><span><strong>${item.title}</strong><span>${item.description}</span></span>${icon('chevron')}</button>`).join('');
 return `<section class="workspace-welcome"><div><h1>Kontrol Paneli</h1></div><span class="workspace-status"><span></span>LabCafe sunucunda</span></section><div class="workspace-summary"><div><span>Metin kanalı</span><strong>${state.guild.channels.length}</strong></div><div><span>Kullanılabilir komut</span><strong>${state.commands.length}</strong></div><div><span>Bot dili</span><strong>${state.draft.locale==='en'?'English':'Türkçe'}</strong></div></div>${['Sunucu Yönetimi','Kontrol ve Kayıtlar'].map(group=>'<section class="workspace-module-group"><h2>'+group+'</h2><div class="workspace-module-grid">'+cards(group)+'</div></section>').join('')}`;
}
function moduleHeading(title,symbol,meta=''){
 return '<header class="module-heading"><span class="module-heading-icon" aria-hidden="true">'+icon(symbol)+'</span><h1>'+title+'</h1>'+meta+'</header>';
}
function guildCommandsPage(){
 const rows=state.commands.map(command=>{
  const unrestricted=command.name==='ayarlar'||!state.settings.commandChannelId;
  const channel=state.guild.channels.find(item=>item.id===state.settings.commandChannelId);
  const channelLabel=unrestricted?'Tüm kanallar':channel?'# '+channel.name:'Kanal bulunamadı — yeniden seç';
  const management=['ayarlar','kurulum'].includes(command.name);
  return `<details class="command-detail"><summary><span class="command-row-icon">${icon('terminal')}</span><span class="command-row-text"><strong>/${escape(command.name)}</strong><span>${escape(command.description)}</span></span>${management?'<span class="command-permission">'+icon('shield')+'<span>Sunucuyu Yönet</span></span>':''}${icon('down')}</summary><div class="command-detail-body"><dl><div><dt>Komut Kanalı</dt><dd>${escape(channelLabel)}</dd></div></dl><button class="button subtle" data-workspace-view="settings">${icon('settings')} Bot Ayarları</button></div></details>`;
 }).join('');
 return '<section class="workspace-detail">'+moduleHeading('Komutlar','terminal','<span class="module-count">'+state.commands.length+'</span>')+'<div class="module-commands">'+rows+'</div></section>';
}
function guildChecksPage(){
 const analysis=state.analysis;
 const checks=analysis?analysis.checks.map(check=>{
  const kind=check.status==='info'?'info':check.ok===false||check.status==='warning'?'warning':check.ok===null?'unknown':'pass';
  const label=kind==='info'?'Bilgi':kind==='unknown'?'Kontrol edilmedi':kind==='pass'?'Uygun':'Dikkat gerekiyor';
  return '<li><details class="module-check" data-result="'+kind+'" '+(kind==='warning'?'open':'')+'><summary><span class="check-state-icon">'+icon(kind==='pass'?'check':'info')+'</span><strong>'+escape(check.label)+'</strong><span class="check-state-label">'+label+'</span>'+icon('down')+'</summary><p>'+escape(check.detail)+'</p></details></li>';
 }).join(''):'';
 return '<section class="workspace-detail">'+moduleHeading('Sunucu Kontrolü','shield')+(analysis?'<ul class="module-checks">'+checks+'</ul><p class="module-timestamp">Kontrol: '+escape(new Date(analysis.checkedAt).toLocaleString(document.documentElement.lang==='en'?'en-GB':'tr-TR'))+'</p>':'<div class="workspace-empty">Kontrol bilgisi alınamadı.</div>')+'</section>';
}
function guildHistoryPage(){
 const rows=state.history.map(item=>'<li><span class="history-event-icon" aria-hidden="true">'+icon(item.action==='reset'?'refresh':'settings')+'</span><div><strong>'+(item.action==='reset'?'Ayarlar sıfırlandı':item.action.startsWith('command-access:')?'Komut erişimi güncellendi':'Ayarlar güncellendi')+'</strong><time datetime="'+escape(new Date(item.changedAt).toISOString())+'">'+escape(new Date(item.changedAt).toLocaleString(document.documentElement.lang==='en'?'en-GB':'tr-TR'))+'</time><details class="history-actor"><summary>İşlemi yapan</summary><code>'+escape(item.actorId)+'</code></details></div></li>').join('');
 return '<section class="workspace-detail">'+moduleHeading('İşlem Geçmişi','refresh','<span class="module-count" title="Son 20 işlem">'+state.history.length+'</span>')+(rows?'<ol class="module-history">'+rows+'</ol>':'<div class="workspace-empty">'+icon('refresh')+'<h2>Henüz kayıtlı işlem yok.</h2></div>')+'</section>';
}
function setWorkspaceView(view){
 if(!['overview','settings','commands','checks','history'].includes(view))return;
 state.view=view;const params=new URLSearchParams(location.search);params.set('guild',state.guild.id);
 if(view==='overview')params.delete('view');else params.set('view',view);
 history.replaceState({},'','/dashboard?'+params);renderContent();focusContent();
}

function renderContent(){
  const titles={overview:'Kontrol Paneli',settings:'Bot Ayarları',commands:'Komutlar',checks:'Sunucu Kontrolü',history:'İşlem Geçmişi'};
  document.title='LabCafe — '+titles[state.view];
  const body=state.view==='overview'?guildWorkspaceOverview():state.view==='settings'?'<section class="workspace-detail">'+moduleHeading('Bot Ayarları','settings')+settingsFields()+'</section>':state.view==='checks'?guildChecksPage():state.view==='history'?guildHistoryPage():guildCommandsPage();
  document.querySelector('#content').innerHTML=`<div class="guild-workspace-layout">${guildWorkspaceSidebar()}<div class="guild-workspace-body"><div class="workspace-page">${body}</div></div></div>`;
  document.querySelectorAll('[data-workspace-view]').forEach(button=>button.addEventListener('click',()=>setWorkspaceView(button.dataset.workspaceView)));
  document.querySelector('#workspace-guild').addEventListener('change',event=>{if(canLeave())selectGuild(event.target.value);else event.target.value=state.guild.id;});
  const language=document.querySelector('#bot-language');
  if(language){language.value=state.draft.locale||'tr';language.addEventListener('change',()=>{window.labcafeTrack?.('setting_change_started');state.draft.locale=language.value;updateSaveBar();});}
  const visibility=document.querySelector('#reply-visibility');
  if(visibility){visibility.value=state.draft.ephemeralReplies?'gizli':'acik';visibility.addEventListener('change',()=>{window.labcafeTrack?.('setting_change_started');state.draft.ephemeralReplies=visibility.value==='gizli';updateSaveBar();});}
  const channel=document.querySelector('#command-channel');
  if(channel){channel.value=state.draft.commandChannelId || '';channel.addEventListener('change',()=>{window.labcafeTrack?.('setting_change_started');state.draft.commandChannelId=channel.value || null;updateSaveBar();});}
  document.querySelector('#reset')?.addEventListener('click',()=>document.querySelector('#reset-dialog').showModal());
  updateSaveBar();
}
function updateSaveBar(){
  const bar=document.querySelector('#save-bar');
  document.querySelector('#save-login').hidden=state.saveStatus!==401||!state.saveError;
  bar.classList.toggle('save-error',state.saveError);
  const message=bar.querySelector('span');
  message.textContent=state.saveError?(state.saveMessage||'Kaydedilemedi. Tekrar dene.'):'Dikkat - kaydedilmemiş değişiklikler var!';
  message.setAttribute('role',state.saveError?'alert':'status');
  document.querySelector('#save-bar').hidden=!dirty();
  document.querySelector('#save').disabled=state.saving;document.querySelector('#discard').disabled=state.saving;document.querySelectorAll('#bot-language,#reply-visibility,#command-channel,#reset').forEach(field=>{field.disabled=state.saving;});
  buttonBusy(document.querySelector('#save'),state.saving,'Kaydediliyor…');
}
async function save(){
  if(state.saving||!dirty())return;
  window.labcafeTrack?.('setting_change_confirmed');
    state.saveError=false;state.saving=true;updateSaveBar();
  for(const id of ['reply-visibility','command-channel'])document.getElementById(id)?.setAttribute('disabled','');
  try{const result=await api(`/api/guilds/${state.guild.id}/settings`,{method:'PATCH',headers:{'X-Settings-Base':JSON.stringify(state.settings)},body:JSON.stringify(state.draft)});state.settings=result.settings;state.draft={...result.settings};state.history=result.history||state.history;state.analysis=result.analysis||state.analysis;}
  catch(error){state.saveError=true;state.saveStatus=error.status;state.saveMessage=error.message;}finally{window.labcafeTrack?.(state.saveError?'setting_change_failed':'setting_change_succeeded');state.saving=false;renderContent();if(state.saveError)document.querySelector('#save')?.focus();else focusContent();}
}
async function reset(){
  if(state.saving)return;
  state.saving=true;document.querySelector('#confirm-reset').disabled=true;buttonBusy(document.querySelector('#confirm-reset'),true,'Kaydediliyor…');
  try{const result=await api(`/api/guilds/${state.guild.id}/reset`,{method:'POST',headers:{'X-Settings-Base':JSON.stringify(state.settings)}});state.history=result.history||[];state.analysis=result.analysis||state.analysis;state.settings=result.settings;state.draft={...result.settings};document.querySelector('#reset-dialog').close();toast('Ayarlar sıfırlandı.');}
  catch(error){toast(error.message,true);}finally{state.saving=false;document.querySelector('#confirm-reset').disabled=false;buttonBusy(document.querySelector('#confirm-reset'),false);renderContent();}
}
function marqueeGroup(items) {
  function cards(duplicate) {
    return Array.from({length:Math.max(10,items.length)},(_,index)=>{
      const guild=items[index % items.length];
      const repeated=duplicate || index>=items.length;
      return `<article class="feature-card server-card"${repeated?' aria-hidden="true"':''}>${avatar(guild)}<div><strong>${guildBadge(guild)}${escape(guild.name)}</strong><p>${guild.members===null?'Discord sunucusu':`${Number(guild.members).toLocaleString('tr-TR')} üye`}</p></div></article>`;
    }).join('');
  }
  return `<div class="marquee-group">${cards(false)}</div><div class="marquee-group" aria-hidden="true">${cards(true)}</div>`;
}
function renderPublicGuilds() {
  const section=document.querySelector('#public-guilds');
  if(!section || !state.publicGuilds.length)return;
  const middle=Math.ceil(state.publicGuilds.length/2);
  const first=state.publicGuilds.slice(0,middle),second=state.publicGuilds.slice(middle);
  section.innerHTML=`<p class="feature-intro">${icon('trending')} <span><strong>${Number(state.publicGuildCount).toLocaleString('tr-TR')}</strong> adet Discord sunucusu tarafından kullanılıyor</span></p><div class="feature-track"><div class="feature-row">${marqueeGroup(first)}</div><div class="feature-row second-row">${marqueeGroup(second.length?second:first)}</div></div>`;
  section.hidden=false;section.setAttribute('aria-busy','false');
  for(const row of section.querySelectorAll('.feature-row')){
    const distance=row.firstElementChild.getBoundingClientRect().width;
    row.style.animationDuration=`${distance/40}s`;
  }
}
function guildPlaceholders() {
  return coffeeLoader('Sunucular yükleniyor');
}
async function loadPublicGuilds() {
  try {
    const data=await api('/api/public/guilds');
    const changed=state.publicGuildCount!==data.count || JSON.stringify(state.publicGuilds)!==JSON.stringify(data.guilds);
    state.publicGuilds=data.guilds;state.publicGuildCount=data.count;
    if(changed){updateSupportMenu();renderPublicGuilds();}
    if(!data.guilds.length)document.querySelector('#public-guilds')?.setAttribute('hidden','');
  } catch {
    if(!state.publicGuilds.length)document.querySelector('#public-guilds')?.setAttribute('hidden','');
  }
}
function founderNote(){return '';}

function landing(message=''){
  document.title='LabCafe — Ana Sayfa';
  app.innerHTML=`${header(Boolean(state.user))}<main id="main-content" class="landing landing-home"><section class="landing-hero"><div class="hero-copy"><h1>Sunucunu <span>sen yönet.</span></h1><p>Komutlarını düzenle, sunucu kontrollerini incele ve ayarlarını yönet.</p><div class="landing-actions"><a class="button primary" href="${inviteUrl()}" target="_blank" rel="noopener noreferrer">${icon('discord')} LabCafe’yi Ekle</a><a class="button" href="${state.user?'/dashboard':'/auth/login'}">Yönetim Panelini Aç</a></div></div><div class="hero-art">${heroWorkshop()}</div></section><section class="landing-features" id="public-guilds" aria-label="LabCafe kullanan sunucular" hidden></section>${founderNote()}${message?`<p class="login-note" role="status">${escape(message)}</p>`:''}</main>${footer()}${dialogs()}`;bindShell();renderPublicGuilds();void loadPublicGuilds();
}
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
async function init(){
  try{
    const [config,session]=await Promise.all([api('/api/public'),api('/api/session')]);state.clientId=config.clientId;state.installFlowEnabled=config.installFlowEnabled;state.supportGuildId=config.supportGuildId;state.supportInviteUrl=config.supportInviteUrl;
    if(config.publicGuilds){state.publicGuilds=config.publicGuilds.guilds;state.publicGuildCount=config.publicGuilds.count;}
    const featureKey=location.pathname.startsWith('/features/')?location.pathname.split('/')[2]:null;
    if(featureKey&&featurePages[featureKey]){if(session.authenticated){state.user=session.user;state.csrf=session.csrf;state.isOwner=session.isOwner===true;}featurePage(featureKey);return;}
    if(!session.authenticated){if(location.pathname!=='/'){location.replace('/auth/login');return;}const error=new URLSearchParams(location.search).get('error');landing(error==='login-cancelled'?'Discord girişi iptal edildi.':!config.loginConfigured?'Discord girişi henüz etkinleştirilmedi. Destek sunucusundan bize ulaşabilirsin.':'');return;}
    state.user=session.user;state.csrf=session.csrf;state.isOwner=session.isOwner===true;if(location.pathname==='/'){landing();return;}if(location.pathname==='/admin'){await showOwner();return;}shell();
    const requestedGuild=new URLSearchParams(location.search).get('guild');
    document.querySelector('#content').innerHTML=dashboardSkeleton('guilds');state.guilds=(await api('/api/guilds')).guilds;showGuilds(false);void loadPublicGuilds();
    if(state.guilds.some(guild=>guild.id===requestedGuild))await selectGuild(requestedGuild);
  }catch(error){const key=location.pathname.split('/')[2];if(location.pathname.startsWith('/features/')&&featurePages[key]){featurePage(key);return;}if(location.pathname!=='/'){dashboardError(error,()=>location.reload());}else landing(error.message);}
}
window.addEventListener('popstate',()=>{
  if(dirty()){location.reload();return;}
  const id=new URLSearchParams(location.search).get('guild');
  if(id&&state.guilds.some(g=>g.id===id))void selectGuild(id);else if(state.user)showGuilds(false);
});
void init();

async function showOwner(){
  document.title='LabCafe — Yönetim';
  shell();
  const content=document.querySelector('#content');
  if(!state.isOwner){content.innerHTML='<h1>Erişim yok</h1><p>Bu alan yalnızca bot sahibine açık.</p>';return;}
  const policy=await api('/api/admin/beta');
  content.innerHTML=`<div class="owner-heading"><h1>LabCafe Yönetimi</h1><p>Site trafiği, önemli işlemler ve erişim ayarları.</p></div><nav class="owner-tabs" aria-label="Yönetim bölümleri"><button data-owner-tab="analytics" aria-pressed="true">${icon('trending')} Site Analizi</button><button data-owner-tab="beta" aria-pressed="false">${icon('shield')} Beta Erişimi</button></nav><section id="owner-analytics"></section><section class="owner-panel" id="owner-beta" hidden><h2>Kapalı beta erişimi</h2><form id="beta-form"><label class="owner-toggle"><input type="checkbox" id="beta-enabled" ${policy.enabled?'checked':''}> Yalnızca listedeki sunuculara izin ver</label><label for="beta-guilds">Beta sunucuları</label><textarea id="beta-guilds" rows="8" placeholder="Her satıra bir Discord sunucu ID’si">${escape(policy.guildIds.join('\n'))}</textarea><p>Kısıt açık ve liste boşsa tüm sunuculardaki komutlar ve ayar erişimi kapanır. Bot sunuculardan ayrılmaz.</p><button class="button primary" type="submit">Değişiklikleri İncele</button></form></section><dialog id="beta-confirm"><h2>Beta erişimi güncellensin mi?</h2><p id="beta-summary"></p><div class="dialog-actions"><button class="button" id="beta-cancel">Vazgeç</button><button class="button primary" id="beta-save">Onayla ve Kaydet</button></div></dialog>`;
  document.querySelectorAll('[data-owner-tab]').forEach(button=>button.addEventListener('click',()=>{
    const analytics=button.dataset.ownerTab==='analytics';document.querySelector('#owner-analytics').hidden=!analytics;document.querySelector('#owner-beta').hidden=analytics;
    document.querySelectorAll('[data-owner-tab]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  }));
  initProfessionalAnalytics();
  let pending=null;
  const dialog=document.querySelector('#beta-confirm');
  document.querySelector('#beta-form').addEventListener('submit',event=>{
    event.preventDefault();
    const guildIds=[...new Set(document.querySelector('#beta-guilds').value.split(/[\s,]+/).filter(Boolean))];
    if(guildIds.length>100||guildIds.some(id=>!/^\d{17,20}$/.test(id))){toast('En fazla 100 geçerli sunucu ID gir.',true);return;}
    pending={enabled:document.querySelector('#beta-enabled').checked,guildIds};
    document.querySelector('#beta-summary').textContent=pending.enabled?`${guildIds.length} sunucuya izin verilecek. Listedekiler dışındaki sunucuların komut ve ayar erişimi kapanacak.`:'Sunucu listesiyle beta kısıtlaması kapatılacak. Komut kayıt kapsamı değişmeyecek.';
    dialog.showModal();
  });
  document.querySelector('#beta-cancel').addEventListener('click',()=>dialog.close());
  document.querySelector('#beta-save').addEventListener('click',async event=>{
    if(!pending)return;
    event.currentTarget.disabled=true;buttonBusy(event.currentTarget,true,'Kaydediliyor…');
    try{await api('/api/admin/beta',{method:'PUT',body:JSON.stringify(pending)});dialog.close();toast('Beta ayarları kaydedildi.');}
    catch(error){toast(error.message,true);}
    finally{document.querySelector('#beta-save').disabled=false;buttonBusy(document.querySelector('#beta-save'),false);}
  });
}

function analyticsNumber(value){return Number(value||0).toLocaleString(document.documentElement.lang==='en'?'en-GB':'tr-TR');}
function analyticsDate(value){return new Date(value).toLocaleString(document.documentElement.lang==='en'?'en-GB':'tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'});}
function analyticsBins(report){
 const byViews=new Map((report.pageviews||[]).map(p=>[p.date.slice(0,report.range.unit==='hour'?13:10),p.count]));
 const byVisitors=new Map((report.visitors||[]).map(p=>[p.date.slice(0,report.range.unit==='hour'?13:10),p.count]));
 const start=Date.parse(report.range.startDate+'T00:00:00Z'),end=Date.parse(report.range.endDate+'T00:00:00Z');
 const count=report.range.unit==='hour'?Math.min(24,Math.max(1,Math.floor((report.range.end-report.range.start)/3600000)+1)):Math.round((end-start)/86400000)+1;
 return Array.from({length:count},(_,i)=>{
   const date=new Date(start+i*(report.range.unit==='hour'?3600000:86400000));const key=date.toISOString().slice(0,report.range.unit==='hour'?13:10);
   const label=report.range.unit==='hour'?String(i).padStart(2,'0')+':00':date.toLocaleDateString(document.documentElement.lang==='en'?'en-GB':'tr-TR',{timeZone:'UTC',day:'2-digit',month:'short'});
   return {label,views:byViews.get(key)||0,visitors:byVisitors.get(key)||0};
 });
}
function analyticsChart(report){
 const bins=analyticsBins(report),width=900,height=240,left=50,bottom=202,top=18,plot=width-left-18;
 const max=Math.max(1,...bins.map(p=>Math.max(p.views,p.visitors)));const ceiling=Math.max(1,Math.ceil(max/4)*4);
 const x=i=>left+(bins.length===1?plot/2:i*plot/(bins.length-1));const y=value=>bottom-value/ceiling*(bottom-top);
 const path=key=>bins.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
 const grid=Array.from({length:5},(_,i)=>{const value=ceiling*i/4;return `<line x1="${left}" y1="${y(value)}" x2="${width-18}" y2="${y(value)}" class="chart-grid"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end">${Number.isInteger(value)?analyticsNumber(value):value.toFixed(1)}</text>`;}).join('');
 const ticks=[...new Set([0,Math.round((bins.length-1)/3),Math.round((bins.length-1)*2/3),bins.length-1])].map(i=>`<text x="${x(i)}" y="${bottom+25}" text-anchor="${i===0?'start':i===bins.length-1?'end':'middle'}">${escape(bins[i].label)}</text>`).join('');
 const dots=bins.length<=90?bins.map((p,i)=>`<circle class="chart-dot" cx="${x(i)}" cy="${y(p.views)}" r="3" tabindex="0"><title>${escape(p.label)} · ${p.views} görüntülenme · ${p.visitors} ziyaretçi</title></circle>`).join(''):'';
 return `<div class="chart-heading"><h2>Ziyaretlerin zaman içindeki değişimi</h2><div class="chart-legend"><span>● Sayfa görüntülenmesi</span><span>● Tahmini tekil ziyaretçi</span></div></div><svg class="traffic-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ziyaretçi ve sayfa görüntülenmesi grafiği">${grid}${ticks}<path d="${path('views')}" class="chart-views"/><path d="${path('visitors')}" class="chart-visitors"/>${dots}</svg><details class="chart-table"><summary>Tablo olarak göster</summary><div class="analytics-table-scroll"><table><thead><tr><th>Tarih</th><th>Görüntülenme</th><th>Ziyaretçi</th></tr></thead><tbody>${bins.map(p=>`<tr><td>${escape(p.label)}</td><td>${analyticsNumber(p.views)}</td><td>${analyticsNumber(p.visitors)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function analyticsCountry(code){if(!/^[A-Z]{2}$/.test(code))return 'Bilinmiyor';try{return new Intl.DisplayNames([document.documentElement.lang==='en'?'en':'tr'],{type:'region'}).of(code)||code;}catch{return code;}}
function analyticsBreakdown(title,rows,kind){
 const label=row=>kind==='referrer'?(row.label||'Doğrudan / bilinmiyor'):kind==='event'?({bot_add_click:'Botu ekle tıklaması',dashboard_open:'Panel açılışı'}[row.label]||row.label):kind==='country'?analyticsCountry(row.label):kind==='device'?({desktop:'Masaüstü',laptop:'Dizüstü',mobile:'Telefon',tablet:'Tablet',unknown:'Bilinmiyor'}[row.label]||row.label):row.label||'Bilinmiyor';
 const max=Math.max(1,...rows.map(row=>row.count));
 return `<section class="analytics-breakdown"><h2>${title}</h2>${rows.length?`<ol>${rows.map(row=>`<li><div><span title="${escape(label(row))}">${escape(label(row))}</span><strong>${analyticsNumber(row.count)}</strong></div><progress max="${max}" value="${row.count}" aria-label="${escape(label(row))}"></progress></li>`).join('')}</ol>`:'<p class="analytics-empty-small">Bu dönemde kayıt yok.</p>'}</section>`;
}
function analyticsReport(report){
 if(!report.configured)return '<div class="analytics-notice"><h2>Analitik henüz yapılandırılmadı.</h2><p>Site ve bot normal şekilde çalışmaya devam eder.</p></div>';
 if(!report.available)return '<div class="analytics-notice" role="status"><h2>Ölçüm servisine şu anda ulaşılamıyor.</h2><p>Bot ve dashboard çalışmaya devam ediyor. Biraz sonra yenilemeyi deneyebilirsin.</p></div>';
 const metric=(title,value,previous,note)=>{const change=previous>0?`${value>=previous?'+':''}${((value-previous)/previous*100).toFixed(1)}%`:value?'Yeni':'—';return `<article><span>${title}</span><strong>${analyticsNumber(value)}</strong><p>${note||`<b>${change}</b> · Önceki dönem: ${analyticsNumber(previous)}`}</p></article>`;};
 return `<div class="analytics-summary">${metric('Tahmini tekil ziyaretçi',report.summary.visitors,report.previous?.visitors)}${metric('Sayfa görüntülenmesi',report.summary.pageviews,report.previous?.pageviews)}${metric('Ziyaret',report.summary.visits,report.previous?.visits)}${metric('Şu anda aktif',report.active,0,'Son 5 dakika')}</div>${!report.summary.pageviews?'<div class="analytics-notice"><strong>Henüz ziyaret kaydı yok.</strong><p>Seçili döneme ait gerçek veriler geldikçe grafikler burada oluşacak.</p></div>':''}<section class="analytics-chart-card">${analyticsChart(report)}</section><div class="analytics-breakdowns">${analyticsBreakdown('Popüler sayfalar',report.pages||[],'path')}${analyticsBreakdown('Trafik kaynakları',report.referrers||[],'referrer')}${analyticsBreakdown('Cihazlar',report.devices||[],'device')}${analyticsBreakdown('Tarayıcılar',report.browsers||[],'browser')}${analyticsBreakdown('Ülkeler',report.countries||[],'country')}${analyticsBreakdown('Web etkileşimleri',report.events||[],'event')}</div><section class="conversion-section"><h2>Doğrulanmış işlemler</h2><p>Buton tıklamalarından ayrı, sunucuda gerçekleşen olaylar sayılır.</p>${report.conversions?`<div class="analytics-summary conversion-summary">${metric('Başarılı Discord girişi',report.conversions.loginSuccess,0,'Kendi hesabın hariç')}${metric('Botun sunucuya katılması',report.conversions.botJoined,0,'Yeniden eklemeler de bir olay sayılır')}</div>`:'<p>İşlem sayacı şu anda kullanılamıyor.</p>'}</section><p class="analytics-footnote">Ölçüm başlangıcı: ${escape(analyticsDate(report.startedAt))} · Son güncelleme: ${escape(analyticsDate(report.fetchedAt))}<br>Saat dilimi: Europe/Istanbul · Ayrıntılı veriler 90 gün saklanır. Tekil ziyaretçi sayısı tahminidir; engelleyiciler ve farklı cihazlar sayımı etkiler. Yönetici oturumun, /admin ve bilinen bot ziyaretleri hariç tutulur.</p>`;
}
function initProfessionalAnalytics(){
 const host=document.querySelector('#owner-analytics');if(!host)return;
 const en=document.documentElement.lang.startsWith('en');
 host.innerHTML=`<section class="analytics-chart-card professional-entry"><div><h2>Profesyonel Site Analizi</h2><p>Canlı trafik, ziyaretçi haritası, yoğun saatler, kaynaklar, sayfalar ve detaylı davranış raporları.</p><a class="button primary" href="/admin/analytics?lang=${en?'en':'tr'}">Tam Analiz Panelini Aç ${icon('external')}</a><p class="analytics-footnote">Umami · Yalnızca senin Discord hesabına açık.</p></div><div class="analytics-capabilities"><span>Canlı trafik</span><span>Harita</span><span>Ziyaretçi yolculukları</span><span>Kişisel panolar</span><span>Hedefler ve huniler</span><span>Dönem karşılaştırması</span></div></section><section class="conversion-section"><h2>Doğrulanmış işlemler</h2><p>Discord girişleri ve bot katılımları günlük toplamdır; ziyaretçi hunisinden bağımsız tutulur.</p><div id="owner-conversions">${coffeeLoader('İşlem sayaçları hazırlanıyor.')}</div></section>`;
 void api('/api/admin/analytics?period=30').then(report=>{const target=document.querySelector('#owner-conversions');if(!target)return;target.innerHTML=report.conversions?`<p>Son 30 gün</p><div class="analytics-summary conversion-summary"><article class="analytics-metric"><span>Başarılı Discord girişi</span><strong>${analyticsNumber(report.conversions.loginSuccess)}</strong></article><article class="analytics-metric"><span>Botun sunucuya katılması</span><strong>${analyticsNumber(report.conversions.botJoined)}</strong></article></div>`:'<p>İşlem sayacı şu anda kullanılamıyor.</p>';}).catch(()=>{const target=document.querySelector('#owner-conversions');if(target)target.textContent=en?'Operation counts unavailable.':'İşlem sayacı şu anda kullanılamıyor.';});
}
function initAnalyticsPanel(){
 const root=document.querySelector('#owner-analytics');if(!root)return;
 const today=new Date(Date.now()+10800000).toISOString().slice(0,10);
 root.innerHTML=`<form class="analytics-filters" id="analytics-filters"><div><label for="analytics-period">Dönem</label><select id="analytics-period"><option value="1">Bugün</option><option value="7" selected>Son 7 gün</option><option value="30">Son 30 gün</option><option value="90">Son 90 gün</option><option value="custom">Özel tarih aralığı</option></select></div><div id="analytics-custom" hidden><label>Başlangıç<input id="analytics-start" type="date" value="${today}" max="${today}" required></label><label>Bitiş<input id="analytics-end" type="date" value="${today}" max="${today}" required></label></div><button type="submit" class="button" id="analytics-refresh">${icon('refresh')} Yenile</button></form><div id="analytics-report" aria-live="polite">${coffeeLoader('Veriler alınıyor…')}</div>`;
 let sequence=0;
 const period=root.querySelector('#analytics-period'),custom=root.querySelector('#analytics-custom'),button=root.querySelector('#analytics-refresh');
 const load=async()=>{const request=++sequence;button.disabled=true;buttonBusy(button,true,'Veriler alınıyor…');root.querySelector('#analytics-report').setAttribute('aria-busy','true');
  const query=new URLSearchParams({period:period.value});if(period.value==='custom'){query.set('start',root.querySelector('#analytics-start').value);query.set('end',root.querySelector('#analytics-end').value);}
  try{const report=await api('/api/admin/analytics?'+query);if(request!==sequence||!root.isConnected)return;root.querySelector('#analytics-report').innerHTML=analyticsReport(report);}
  catch(error){if(request!==sequence||!root.isConnected)return;root.querySelector('#analytics-report').innerHTML=`<div class="analytics-notice" role="alert"><p>${escape(error.message)}</p></div>`;}
  finally{if(request===sequence&&root.isConnected){button.disabled=false;buttonBusy(button,false);root.querySelector('#analytics-report').setAttribute('aria-busy','false');window.LabCafeLanguage?.refresh();}}
 };
 period.addEventListener('change',()=>{custom.hidden=period.value!=='custom';if(period.value!=='custom')void load();});
 root.querySelector('#analytics-filters').addEventListener('submit',event=>{event.preventDefault();void load();});void load();
}

