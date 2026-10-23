import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MessageFlags,TextDisplayBuilder,SeparatorBuilder,escapeMarkdown} from 'discord.js';
// Card semantics are independent of the former help renderer.
const PANEL_ACCENT={primary:0x956b46,warning:0xc59c63,error:0xba6c66,success:0x78a88a,developer:0x9296ac};
export function labCafeCard(kind:keyof typeof PANEL_ACCENT,title:string,body:string){
 const card=new ContainerBuilder().setAccentColor(PANEL_ACCENT[kind]).addTextDisplayComponents(new TextDisplayBuilder().setContent('## '+escapeMarkdown(title).slice(0,200))).addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(body.slice(0,3500)||'—'));
 return card;
}
const dashboard=(guildId:string)=>{if(!/^\d{17,20}$/.test(guildId))throw new Error('Invalid guild');return 'https://labcafe.xyz/dashboard?guild='+guildId;};
const payload=(card:ContainerBuilder)=>({components:[card],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral,allowedMentions:{parse:[] as []}});
export function setupPrototype(input:{guildId:string;missingPermissions:readonly string[]|null;locale?:'tr'|'en'}){
 const en=input.locale==='en';const status=input.missingPermissions===null?(en?'Permissions could not be verified.':'İzinler doğrulanamadı.'):input.missingPermissions.length?(en?'Missing permissions: ':'Eksik izinler: ')+input.missingPermissions.map(text=>escapeMarkdown(text)).join(', '):(en?'Required permissions are available in this channel.':'Bu kanalda gerekli izinler mevcut.');
 const card=labCafeCard('primary','LabCafe', (en?'Welcome. Manage your setup from the dashboard.':'Hoş geldin. Kurulumunu dashboard üzerinden yönetebilirsin.')+'\n\n'+status);
 card.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(en?'Start setup':'Kuruluma Başla').setURL(dashboard(input.guildId)+'&view=settings'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Dashboard').setURL(dashboard(input.guildId))));
 return payload(card);
}
export function analysisPrototype(input:{guildId:string;guildName:string;checks:readonly {label:string;level:'info'|'warning'|'error';suggestion:string}[]|null;locale?:'tr'|'en'}){
 const en=input.locale==='en';const warnings=input.checks?.filter(check=>check.level!=='info').length;
 const body=input.checks===null?(en?'No analysis results are available yet.':'Henüz kontrol sonucu mevcut değil.'):(en?'Findings: ':'Bulgular: ')+warnings+'\n\n'+input.checks.slice(0,5).map(check=>`**${escapeMarkdown(check.label).slice(0,120)}** · ${check.level}\n${escapeMarkdown(check.suggestion).slice(0,350)}`).join('\n\n');
 const card=labCafeCard(warnings?'warning':'primary',input.guildName.slice(0,150),body);
 card.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(en?'Review in dashboard':'Dashboard’da İncele').setURL(dashboard(input.guildId)+'&view=checks')));
 return payload(card);
}
/** Public crawler preview. No session, bot-only data or server-specific results. */
export function publicComponentPreview(origin:string,clientId:string){
 const url=new URL(origin);if(!['http:','https:'].includes(url.protocol))throw new Error('Invalid origin');
 if(!/^\d{17,20}$/.test(clientId))throw new Error('Invalid client');
 return {component:{type:17,accent_color:PANEL_ACCENT.primary,components:[{type:10,content:'# LabCafe\nSunucunu kur, yönet ve kontrol et. / Set up, manage and check your server.'},{type:14,divider:true,spacing:1},{type:1,components:[{type:2,style:5,label:'Dashboard',url:url.origin+'/dashboard'},{type:2,style:5,label:'LabCafe’yi Ekle / Add LabCafe',url:'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:clientId,scope:'bot applications.commands',permissions:'19456'})}]}]}};
}
