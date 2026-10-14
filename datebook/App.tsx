import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform,
  Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import * as Clipboard from 'expo-clipboard';
import { canonicalize, configured, dateAtLocalTime, overlaps, supabase } from './src/client';
import { CATEGORIES, type Category, type Couple, type DatePlan, type Idea, type Interest, type Member } from './src/types';

const colors = {
  bg: '#FAF7F3', card: '#FFFFFF', ink: '#28231F', secondary: '#776E68',
  rose: '#A64F62', paleRose: '#F7E4E8', border: '#EAE2DC', green: '#366E55',
  paleGreen: '#E7F2E9', warning: '#A25D21', paleWarning: '#FCEDDB',
};
const icons: Record<Category,string> = { Food:'🍝', Activity:'🎨', Event:'🎟️', Outdoors:'🌿', Other:'💡' };
type Tab = 'Home'|'Ideas'|'Plans'|'Us';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatWhen = (iso: string) => new Date(iso).toLocaleString(undefined, {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const errText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong';

function Btn({ title, onPress, kind = 'primary', disabled = false }: {
  title:string; onPress:()=>void; kind?: 'primary'|'outline'|'soft'|'small'; disabled?:boolean;
}) {
  return <Pressable disabled={disabled} onPress={onPress}
    style={[styles.btn, kind === 'primary' && styles.btnPrimary,kind === 'outline' && styles.btnOutline,
      kind === 'soft' && styles.btnSoft,kind === 'small' && styles.btnSmall,disabled && {opacity:0.45}]}>
    <Text style={[styles.btnLabel, kind === 'primary' && {color:'#FFF'}, kind === 'soft' && {color:colors.rose},kind === 'small' && {color:colors.rose}]}>{title}</Text>
  </Pressable>;
}
function Field({label,value,onChangeText,placeholder,multiline=false,keyboardType='default',autoCapitalize='sentences'}: {
  label:string;value:string;onChangeText:(v:string)=>void;placeholder?:string;multiline?:boolean;
  keyboardType?: 'default'|'email-address'|'url';autoCapitalize?: 'none'|'sentences'|'words';
}) {
  return <View style={{gap:7}}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    style={[styles.input,multiline && {height:92,textAlignVertical:'top'}]} value={value}
    onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#B7ABA3"
    keyboardType={keyboardType} autoCapitalize={autoCapitalize} multiline={multiline}/></View>;
}
function Chip({label,active=false,onPress}: {label:string;active?:boolean;onPress?:()=>void}) {
  return <Pressable onPress={onPress} disabled={!onPress} style={[styles.chip,active && styles.chipActive]}>
    <Text style={[styles.chipLabel,active && {color:colors.rose}]}>{label}</Text>
  </Pressable>;
}
function Empty({emoji,title,message}: {emoji:string;title:string;message:string}) {
  return <View style={styles.empty}><Text style={{fontSize:34}}>{emoji}</Text><Text style={styles.emptyTitle}>{title}</Text>
  <Text style={styles.mutedCentered}>{message}</Text></View>;
}

export default function App() {
  const [session,setSession] = useState<Session|null>(null);
  const [authReady,setAuthReady] = useState(false);
  const [workspaceLoaded,setWorkspaceLoaded] = useState(false);
  const [couple,setCouple] = useState<Couple|null>(null);
  const [members,setMembers] = useState<Member[]>([]);
  const [ideas,setIdeas] = useState<Idea[]>([]);
  const [interests,setInterests] = useState<Interest[]>([]);
  const [seen,setSeen] = useState<{idea_id:string;user_id:string}[]>([]);
  const [plans,setPlans] = useState<DatePlan[]>([]);
  const [tab,setTab] = useState<Tab>('Home');
  const [loading,setLoading] = useState(false);
  const [refreshing,setRefreshing] = useState(false);
  const [addOpen,setAddOpen] = useState(false);
  const [selected,setSelected] = useState<Idea|null>(null);
  const userId = session?.user.id || '';

  useEffect(() => {
    if (!configured) {setAuthReady(true); return;}
    supabase.auth.getSession().then(({data}) => {setSession(data.session);setAuthReady(true);})
      .catch(()=>setAuthReady(true));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,newSession)=>setSession(newSession));
    return () => subscription.unsubscribe();
  },[]);

  const load = useCallback(async (quiet=false) => {
    if (!session) return;
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const {data:membership,error:memberError} = await supabase.from('couple_members')
        .select('couple_id,user_id,display_name').eq('user_id',session.user.id).maybeSingle();
      if (memberError) throw memberError;
      if (!membership) {setCouple(null);setMembers([]);setIdeas([]);setInterests([]);setSeen([]);setPlans([]);return;}
      const id = membership.couple_id;
      const [co,me,ide,inte,seenRows,pl] = await Promise.all([
        supabase.from('couples').select('id,invite_code,name').eq('id',id).single(),
        supabase.from('couple_members').select('couple_id,user_id,display_name').eq('couple_id',id),
        supabase.from('ideas').select('*').eq('couple_id',id).order('created_at',{ascending:false}),
        supabase.from('idea_interests').select('idea_id,user_id,interested'),
        supabase.from('idea_seen').select('idea_id,user_id'),
        supabase.from('plans').select('*').eq('couple_id',id).order('scheduled_start',{ascending:true}),
      ]);
      for (const res of [co,me,ide,inte,seenRows,pl]) if (res.error) throw res.error;
      setCouple(co.data as Couple);setMembers((me.data||[]) as Member[]);
      setIdeas((ide.data||[]) as Idea[]);setInterests((inte.data||[]) as Interest[]);
      setSeen((seenRows.data||[]) as {idea_id:string;user_id:string}[]);
      setPlans((pl.data||[]) as DatePlan[]);
    } catch(e) {Alert.alert('Could not load Datebook',errText(e));}
    finally {setLoading(false);setRefreshing(false);setWorkspaceLoaded(true);}
  },[session]);
  useEffect(()=>{
    setWorkspaceLoaded(false);
    setCouple(null);setMembers([]);setIdeas([]);setInterests([]);setSeen([]);setPlans([]);
    if(session) void load();
  },[session?.user.id,load]);

  async function createOrJoin(name:string,code?:string) {
    setLoading(true);
    try {
      const {error} = code
        ? await supabase.rpc('join_couple',{p_invite_code:code,p_display_name:name})
        : await supabase.rpc('create_couple',{p_display_name:name});
      if (error) throw error;
      await load();
    } catch(e) {Alert.alert('Could not set up your space',errText(e));}
    finally {setLoading(false);}
  }

  async function saveIdea(input:{title:string;url:string;venue:string;category:Category;notes:string;priceNote:string}) {
    if (!couple) return;
    const canonical = canonicalize(input.url);
    if (input.url.trim() && !canonical) {Alert.alert('Invalid link','Use a full https:// URL.');return;}
    const title = input.title.trim() || (canonical?.includes('instagram') ? 'Instagram idea' : canonical?.includes('tiktok') ? 'TikTok idea' : 'New date idea');
    const dupe = ideas.find(i => (canonical && i.canonical_url === canonical)
       || (i.title.toLowerCase() === title.toLowerCase() && Boolean(input.venue.trim()) && i.venue?.toLowerCase()===input.venue.trim().toLowerCase()));
    if (dupe) {setAddOpen(false);void openIdea(dupe);Alert.alert('Already in your Datebook','This idea was saved before. Opening the original.');return;}
    setLoading(true);
    try {
      const {error} = await supabase.from('ideas').insert({
        couple_id:couple.id, created_by:userId,title,source_url:input.url.trim()||null,
        canonical_url:canonical,venue:input.venue.trim()||null,category:input.category,
        notes:input.notes.trim()||null, price_note:input.priceNote.trim()||null,
      });
      if (error) throw error;
      setAddOpen(false);await load(true);
    } catch(e) {Alert.alert('Could not save idea',errText(e));}
    finally {setLoading(false);}
  }
  async function openIdea(idea:Idea) {
    setSelected(idea);
    if (!seen.some(s=>s.idea_id===idea.id&&s.user_id===userId)) {
      const {error} = await supabase.from('idea_seen').upsert({idea_id:idea.id,user_id:userId});
      if (!error) await load(true);
    }
  }
  async function vote(idea:Idea) {
    const current = interests.find(x=>x.idea_id===idea.id && x.user_id===userId)?.interested;
    const {error} = await supabase.from('idea_interests').upsert({idea_id:idea.id,user_id:userId,interested:!current});
    if (error) Alert.alert('Could not update interest',error.message);
    else await load(true);
  }
  async function markDone(idea:Idea) {
    const {error} = await supabase.from('ideas').update({status:'done'}).eq('id',idea.id);
    if (error) Alert.alert('Could not update',error.message);
    else {setSelected(null);await load(true);}
  }
  async function schedule(idea:Idea,day:string,time:string,duration:number) {
    if (!couple) return;
    const start = dateAtLocalTime(day,time);
    if (!start) {Alert.alert('Check the date','Use YYYY-MM-DD for the date and HH:MM for the time (24-hour clock).');return;}
    const end = new Date(start.getTime()+duration*60000);
    const conflicts = plans.filter(p=>overlaps(start.toISOString(),end.toISOString(),p.scheduled_start,p.scheduled_end));
    const finish = async () => {
      setLoading(true);
      try {
        const {error} = await supabase.from('plans').insert({couple_id:couple.id,idea_id:idea.id,
          scheduled_start:start.toISOString(),scheduled_end:end.toISOString(),created_by:userId});
        if (error) throw error;
        const {error:statusError} = await supabase.from('ideas').update({status:'planned'}).eq('id',idea.id);
        if (statusError) throw statusError;
        setSelected(null);setTab('Plans');await load(true);
      } catch(e) {Alert.alert('Could not schedule',errText(e));}
      finally {setLoading(false);}
    };
    if (conflicts.length) Alert.alert('Schedule conflict',
      `This overlaps ${conflicts.length} existing Datebook plan(s). Schedule anyway?`,[
        {text:'Cancel',style:'cancel'},{text:'Schedule anyway',onPress:()=>void finish()},
      ]);
    else void finish();
  }
  async function removePlan(p:DatePlan) {
    Alert.alert('Remove this plan?','The idea will remain saved.',[
      {text:'Cancel',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:()=>void (async()=>{
        const {error} = await supabase.from('plans').delete().eq('id',p.id);
        if (error) Alert.alert('Could not remove plan',error.message);
        else await load(true);
      })()},
    ]);
  }
  function ideaCard(idea:Idea) {
    const votes=interests.filter(x=>x.idea_id===idea.id && x.interested).length;
    const mine=interests.some(x=>x.idea_id===idea.id && x.user_id===userId && x.interested);
    const viewed=seen.some(x=>x.idea_id===idea.id&&x.user_id===userId);
    const savedBy=members.find(m=>m.user_id===idea.created_by)?.display_name || 'Partner';
    return <Pressable key={idea.id} onPress={()=>void openIdea(idea)} style={styles.ideaCard}>
      <View style={styles.ideaIcon}><Text style={{fontSize:30}}>{icons[idea.category]}</Text></View>
      <View style={{flex:1,gap:5}}>
        <Text style={styles.ideaTitle} numberOfLines={2}>{idea.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{idea.category}{idea.venue?` · ${idea.venue}`:''} · Added by {savedBy}</Text>
        <View style={{flexDirection:'row',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <Chip label={idea.status==='done'?'Done':idea.status==='planned'?'Planned':'Saved'}/>
          {votes>0 && <Chip label={`♥ ${votes} interested`} active={votes===2}/>}
          {viewed && <Chip label="👀 Seen in Datebook"/>}
        </View>
      </View>
      <Pressable onPress={()=>void vote(idea)} style={styles.heartAction}><Text style={{fontSize:23,color:colors.rose}}>{mine?'♥':'♡'}</Text></Pressable>
    </Pressable>;
  }

  if (!configured) return <SafeAreaView style={styles.fullCenter}><Text style={{fontSize:50}}>💌</Text>
    <Text style={styles.h1}>Datebook</Text><Text style={styles.mutedCentered}>Add your Supabase project settings in .env to start.</Text>
    <Text style={styles.meta}>See README.md inside the starter kit.</Text></SafeAreaView>;
  if (!authReady) return <SafeAreaView style={styles.fullCenter}><ActivityIndicator color={colors.rose}/></SafeAreaView>;
  if (!session) return <AuthScreen/>;
  if (!workspaceLoaded) return <SafeAreaView style={styles.fullCenter}><ActivityIndicator color={colors.rose}/><Text style={styles.meta}>Opening your shared Datebook…</Text></SafeAreaView>;
  if (!couple) return <SetupScreen loading={loading} onSubmit={createOrJoin} onSignOut={()=>void supabase.auth.signOut()}/>;
  const firstName=members.find(m=>m.user_id===userId)?.display_name||'You';
  const partner=members.find(m=>m.user_id!==userId)?.display_name;
  const suggested=ideas.filter(i=>i.status!=='done')
    .sort((a,b)=>interests.filter(x=>x.idea_id===b.id && x.interested).length-interests.filter(x=>x.idea_id===a.id && x.interested).length);
  const futurePlans=plans.filter(p=>new Date(p.scheduled_end)>=new Date());

  return <SafeAreaView style={styles.app}>
    <StatusBar barStyle="dark-content" backgroundColor={colors.bg}/>
    <View style={styles.header}>
      <View><Text style={styles.brand}>datebook <Text style={{color:colors.rose}}>♥</Text></Text>
      <Text style={styles.kicker}>{partner?`${firstName} + ${partner}`:`${firstName} · Invite your partner`}</Text></View>
      <Pressable style={styles.addCircle} onPress={()=>setAddOpen(true)}><Text style={{fontSize:27,color:'white',marginTop:-3}}>+</Text></Pressable>
    </View>
    <ScrollView style={{flex:1}} contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.rose}/>}>
      {tab==='Home' && <>
        <View style={styles.hero}><Text style={styles.heroEyebrow}>A LITTLE MORE TIME TOGETHER</Text>
          <Text style={styles.heroTitle}>Make room for{ '\n' }good moments.</Text>
          <Text style={styles.heroSubtitle}>Keep the ideas. Make the plans. Enjoy the dates.</Text>
          <Btn title="+ Add a date idea" onPress={()=>setAddOpen(true)} kind="primary"/>
        </View>
        <View style={styles.stats}>
          <View style={styles.statBox}><Text style={styles.statNum}>{ideas.length}</Text><Text style={styles.meta}>Shared ideas</Text></View>
          <View style={styles.statBox}><Text style={styles.statNum}>{futurePlans.length}</Text><Text style={styles.meta}>Upcoming plans</Text></View>
          <View style={styles.statBox}><Text style={styles.statNum}>{ideas.filter(i=>interests.filter(x=>x.idea_id===i.id&&x.interested).length===2).length}</Text><Text style={styles.meta}>Both like</Text></View>
        </View>
        <View style={styles.headingRow}><Text style={styles.h2}>Our next dates</Text><Pressable onPress={()=>setTab('Plans')}><Text style={styles.link}>See all →</Text></Pressable></View>
        {futurePlans.length ? futurePlans.slice(0,2).map(p=> <View key={p.id} style={styles.planRow}><Text style={{fontSize:22}}>🗓️</Text><View style={{flex:1}}>
          <Text style={styles.ideaTitle}>{ideas.find(i=>i.id===p.idea_id)?.title||'Date plan'}</Text>
          <Text style={styles.meta}>{formatWhen(p.scheduled_start)}</Text></View></View>)
          : <Empty emoji="🗓️" title="Nothing scheduled yet" message="Pick one of your ideas and turn it into a plan."/>}
        <View style={styles.headingRow}><Text style={styles.h2}>Worth making time for</Text><Pressable onPress={()=>setTab('Ideas')}><Text style={styles.link}>All ideas →</Text></Pressable></View>
        {suggested.length ? suggested.slice(0,3).map(ideaCard) : <Empty emoji="✨" title="A fresh start" message="Find a post you love and save its link here."/>}
      </>}
      {tab==='Ideas' && <IdeasScreen ideas={ideas} renderIdea={ideaCard} onAdd={()=>setAddOpen(true)}/>}
      {tab==='Plans' && <>
        <Text style={styles.h1}>Our plans</Text><Text style={styles.subhead}>Dates you've put on the calendar, together.</Text>
        {plans.length?plans.map((p,index)=>{
          const match=ideas.find(i=>i.id===p.idea_id);
          const conflict=plans.some(other=>other.id!==p.id&&overlaps(p.scheduled_start,p.scheduled_end,other.scheduled_start,other.scheduled_end));
          return <View style={styles.planCard} key={p.id}>
            <Text style={styles.dateLabel}>{formatWhen(p.scheduled_start)}</Text>
            <Text style={styles.ideaTitle}>{match?.title||'Date plan'}</Text>
            <Text style={styles.meta}>{match?.venue||'Location TBD'}</Text>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
              <Chip label={conflict?'⚠ Overlaps another plan':'✓ In Datebook'} active={!conflict}/>
              <Pressable onPress={()=>void removePlan(p)}><Text style={styles.link}>Remove</Text></Pressable>
            </View>
          </View>;
        }):<Empty emoji="📅" title="Your calendar is waiting" message="Open any saved idea and choose Plan this date."/>}
        <Text style={[styles.meta,{lineHeight:19,marginTop:10}]}>Conflict checking currently covers Datebook plans only. Apple/Google Calendar events aren't connected yet.</Text>
      </>}
      {tab==='Us' && <>
        <Text style={styles.h1}>Our space</Text><Text style={styles.subhead}>Your private collection for two.</Text>
        <View style={styles.sectionCard}><Text style={styles.fieldLabel}>PEOPLE IN THIS DATEBOOK</Text>
          {members.map(m=><View key={m.user_id} style={styles.memberRow}><Text style={{fontSize:25}}>💛</Text>
            <Text style={styles.ideaTitle}>{m.display_name}{m.user_id===userId?' (you)':''}</Text></View>)}
          {members.length<2&&<Text style={styles.meta}>Your partner hasn't joined yet.</Text>}
        </View>
        <View style={styles.sectionCard}><Text style={styles.fieldLabel}>YOUR PRIVATE INVITE CODE</Text>
          <Text selectable style={styles.invite}>{couple.invite_code}</Text>
          <Text style={styles.meta}>Only share this code privately with your partner.</Text>
          <Btn title="Copy invite code" onPress={()=>void Clipboard.setStringAsync(couple.invite_code)} kind="soft"/>
        </View>
        <View style={styles.sectionCard}><Text style={styles.fieldLabel}>YOUR DATEBOOK</Text>
          <Text style={styles.meta}>Shared ideas: {ideas.length}</Text>
          <Text style={styles.meta}>Date plans: {plans.length}</Text>
          <Btn title="Refresh shared data" onPress={()=>void load(true)} kind="outline"/>
          <Btn title="Sign out" onPress={()=>void supabase.auth.signOut()} kind="outline"/>
        </View>
      </>}
    </ScrollView>
    <View style={styles.tabBar}>{(['Home','Ideas','Plans','Us'] as Tab[]).map(t=>
      <Pressable key={t} onPress={()=>setTab(t)} style={styles.tabItem}>
        <Text style={{fontSize:21}}>{({Home:'⌂',Ideas:'♡',Plans:'▣',Us:'☺'} as Record<Tab,string>)[t]}</Text>
        <Text style={[styles.tabLabel,tab===t&&{color:colors.rose,fontWeight:'700'}]}>{t}</Text>
      </Pressable>)}</View>
    <NewIdeaModal visible={addOpen} onClose={()=>setAddOpen(false)} onSave={saveIdea} busy={loading}/>
    <IdeaDetail visible={!!selected} idea={selected} onClose={()=>setSelected(null)}
      interested={!!selected&&interests.some(x=>x.idea_id===selected.id&&x.user_id===userId&&x.interested)}
      votes={selected?interests.filter(x=>x.idea_id===selected.id&&x.interested).length:0}
      onVote={()=>selected&&void vote(selected)} onSchedule={(day,time,duration)=>selected&&void schedule(selected,day,time,duration)}
      onDone={()=>selected&&void markDone(selected)} busy={loading}/>
  </SafeAreaView>;
}

function AuthScreen() {
  const [email,setEmail]=useState('');const [token,setToken]=useState('');
  const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);
  async function submit() {
    if (!email.includes('@')) {Alert.alert('Enter a valid email');return;}
    setBusy(true);
    try {
      if (sent) {
        const {error}=await supabase.auth.verifyOtp({email:email.trim(),token:token.trim(),type:'email'});
        if(error) throw error;
      } else {
        const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:true}});
        if(error) throw error;
        setSent(true);
      }
    } catch(e) {Alert.alert('Sign-in problem',errText(e));}
    finally {setBusy(false);}
  }
  return <SafeAreaView style={styles.app}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.centeredForm}>
    <Text style={{fontSize:54}}>💌</Text><Text style={styles.h1}>A little more us.</Text>
    <Text style={styles.subhead}>Sign in to share your Datebook with your favorite person.</Text>
    <Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none"/>
    {sent && <><Field label="EMAIL CODE" value={token} onChangeText={setToken} placeholder="6-digit code" autoCapitalize="none"/>
      <Text style={styles.meta}>Enter the one-time code from your email. Check spam if needed.</Text></>}
    <Btn disabled={busy} title={busy?'Working…':sent?'Verify code':'Email me a sign-in code'} onPress={()=>void submit()}/>
    {sent&&<Btn title="Use another email" kind="outline" onPress={()=>{setSent(false);setToken('');}}/>}
  </KeyboardAvoidingView></SafeAreaView>;
}

function SetupScreen({loading,onSubmit,onSignOut}: {loading:boolean;onSubmit:(name:string,code?:string)=>void;onSignOut:()=>void}) {
  const [name,setName]=useState('');const [join,setJoin]=useState(false);const [code,setCode]=useState('');
  return <SafeAreaView style={styles.app}><ScrollView contentContainerStyle={styles.centeredForm}>
    <Text style={{fontSize:46}}>🥂</Text><Text style={styles.h1}>Make it ours.</Text>
    <Text style={styles.subhead}>Create a private space, or enter your partner's invite code.</Text>
    <View style={{flexDirection:'row',gap:8}}>
      <Chip label="Create our space" active={!join} onPress={()=>setJoin(false)}/>
      <Chip label="Join my partner" active={join} onPress={()=>setJoin(true)}/></View>
    <Field label="WHAT SHOULD WE CALL YOU?" value={name} onChangeText={setName} placeholder="Your first name"/>
    {join&&<Field label="PARTNER'S INVITE CODE" value={code} onChangeText={setCode} placeholder="12-character code" autoCapitalize="none"/>}
    <Btn disabled={!name.trim()||loading||(join&&!code.trim())} title={loading?'Working…':join?'Join Datebook':'Create Datebook'} onPress={()=>onSubmit(name.trim(),join?code.trim():undefined)}/>
    <Btn title="Sign out" kind="outline" onPress={onSignOut}/>
  </ScrollView></SafeAreaView>;
}

function IdeasScreen({ideas,renderIdea,onAdd}: {ideas:Idea[];renderIdea:(idea:Idea)=>React.ReactNode;onAdd:()=>void}) {
  const [query,setQuery]=useState('');const [category,setCategory]=useState('All');
  const filtered=ideas.filter(i=>(category==='All'||i.category===category)
    && `${i.title} ${i.venue||''} ${i.notes||''}`.toLowerCase().includes(query.toLowerCase()));
  return <><Text style={styles.h1}>The idea jar</Text>
    <Text style={styles.subhead}>Everything you've both wanted to try.</Text>
    <TextInput value={query} onChangeText={setQuery} style={styles.input} placeholder="Search saved ideas…" placeholderTextColor="#B7ABA3"/>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:6}}>
      {['All',...CATEGORIES].map(c=><Chip key={c} label={c} active={category===c} onPress={()=>setCategory(c)}/>)}</ScrollView>
    <Text style={[styles.meta,{marginVertical:11}]}>{filtered.length} {filtered.length===1?'idea':'ideas'} found</Text>
    {filtered.length?filtered.map(renderIdea):<Empty emoji="💡" title="No ideas found" message="Try another filter or save something new."/>}
    <Btn title="+ Save a new idea" onPress={onAdd} kind="soft"/>
  </>;
}

function NewIdeaModal({visible,onClose,onSave,busy}: {visible:boolean;onClose:()=>void;
  onSave:(v:{title:string;url:string;venue:string;category:Category;notes:string;priceNote:string})=>void;busy:boolean}) {
  const [title,setTitle]=useState('');const [url,setUrl]=useState('');const [venue,setVenue]=useState('');
  const [category,setCategory]=useState<Category>('Activity');const [notes,setNotes]=useState('');const [priceNote,setPriceNote]=useState('');
  useEffect(()=>{if(!visible){setTitle('');setUrl('');setVenue('');setCategory('Activity');setNotes('');setPriceNote('');}},[visible]);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.app}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
      <ScrollView contentContainerStyle={styles.modalScreen} keyboardShouldPersistTaps="handled">
        <View style={styles.headingRow}><Text style={styles.h1}>Save an idea</Text><Pressable onPress={onClose}><Text style={styles.link}>Cancel</Text></Pressable></View>
        <Text style={styles.subhead}>A link, an activity, a place — don't lose it again.</Text>
        <Field label="INSTAGRAM / TIKTOK / WEBSITE LINK (OPTIONAL)" value={url} onChangeText={setUrl} placeholder="https://…" keyboardType="url" autoCapitalize="none"/>
        <Btn title="Paste from clipboard" kind="soft" onPress={()=>void Clipboard.getStringAsync().then(setUrl)}/>
        <Field label="IDEA NAME" value={title} onChangeText={setTitle} placeholder="Pottery class for two"/>
        <Field label="LOCATION / VENUE" value={venue} onChangeText={setVenue} placeholder="Studio name or neighborhood"/>
        <Text style={styles.fieldLabel}>CATEGORY</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{CATEGORIES.map(c=><Chip key={c} label={`${icons[c]} ${c}`} active={category===c} onPress={()=>setCategory(c)}/>)}</View>
        <Field label="PRICE (OPTIONAL)" value={priceNote} onChangeText={setPriceNote} placeholder="$50/person, free, etc."/>
        <Field label="NOTES (OPTIONAL)" value={notes} onChangeText={setNotes} placeholder="Why you saved it, possible dates, booking details…" multiline/>
        <Btn title={busy?'Saving…':'Save to our Datebook'} disabled={busy||(!title.trim()&&!url.trim())} onPress={()=>onSave({title,url,venue,category,notes,priceNote})}/>
      </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function IdeaDetail({visible,idea,onClose,interested,votes,onVote,onSchedule,onDone,busy}: {
  visible:boolean;idea:Idea|null;onClose:()=>void;interested:boolean;votes:number;onVote:()=>void;
  onSchedule:(day:string,time:string,duration:number)=>void;onDone:()=>void;busy:boolean;
}) {
  const [day,setDay]=useState('');const [time,setTime]=useState('18:00');const [duration,setDuration]=useState(120);
  useEffect(()=>{if(visible){const d=new Date();setDay(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);setTime('18:00');setDuration(120);}},[visible,idea?.id]);
  if(!idea)return null;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.app}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
      <ScrollView contentContainerStyle={styles.modalScreen} keyboardShouldPersistTaps="handled">
        <View style={styles.headingRow}><Text style={{fontSize:44}}>{icons[idea.category]}</Text><Pressable onPress={onClose}><Text style={styles.link}>Close</Text></Pressable></View>
        <Text style={styles.h1}>{idea.title}</Text>
        <Text style={styles.subhead}>{idea.category}{idea.venue?` · ${idea.venue}`:''}</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>OUR INTEREST</Text>
          <Text style={styles.meta}>{votes===2?'You both want to try this!':votes===1?'One of you is interested':'No votes yet'}</Text>
          <Btn kind={interested?'soft':'primary'} title={interested?'♥ I’m interested — tap to undo':'♡ I want to do this'} onPress={onVote}/>
          {!!idea.price_note&&<Text style={styles.meta}>Estimated cost: {idea.price_note}</Text>}
          {!!idea.notes&&<Text style={styles.meta}>{idea.notes}</Text>}
          {!!idea.source_url&&<Btn kind="outline" title="Open original post ↗" onPress={()=>void Linking.openURL(idea.source_url!).catch(()=>Alert.alert('Could not open link'))}/>}
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.h2}>Make it a date</Text><Text style={styles.meta}>Choose when you'd like to go (your iPhone's local time).</Text>
          <Field label="DATE (YYYY-MM-DD)" value={day} onChangeText={setDay} placeholder="2026-11-07" autoCapitalize="none"/>
          <Field label="START TIME (HH:MM, 24-HOUR)" value={time} onChangeText={setTime} placeholder="18:00" autoCapitalize="none"/>
          <Text style={styles.fieldLabel}>ESTIMATED DURATION</Text>
          <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>{[60,90,120,180].map(d=><Chip key={d} label={`${d} min`} active={d===duration} onPress={()=>setDuration(d)}/>)}</View>
          <Btn disabled={busy} title={busy?'Saving…':'Add to our plans'} onPress={()=>onSchedule(day,time,duration)}/>
        </View>
        {idea.status!=='done'&&<Btn kind="outline" title="Mark as done ✓" onPress={onDone}/>}
      </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}

const styles=StyleSheet.create({
  app:{flex:1,backgroundColor:colors.bg},fullCenter:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.bg,padding:28,gap:14},
  header:{paddingHorizontal:22,paddingTop:12,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomColor:colors.border,borderBottomWidth:1},
  brand:{fontSize:27,fontWeight:'800',color:colors.ink,letterSpacing:-1.2},kicker:{fontSize:12,color:colors.secondary,marginTop:4},
  addCircle:{backgroundColor:colors.rose,width:43,height:43,borderRadius:23,alignItems:'center',justifyContent:'center'},
  screen:{padding:20,paddingBottom:44,gap:13,maxWidth:680,width:'100%',alignSelf:'center'},
  h1:{fontSize:28,fontWeight:'800',letterSpacing:-0.7,color:colors.ink},h2:{fontSize:20,fontWeight:'800',letterSpacing:-0.3,color:colors.ink},
  subhead:{fontSize:14,color:colors.secondary,lineHeight:21,marginTop:-3,marginBottom:10},
  mutedCentered:{fontSize:14,lineHeight:21,color:colors.secondary,textAlign:'center'},
  hero:{borderRadius:23,backgroundColor:colors.paleRose,padding:23,gap:11,marginBottom:5},
  heroEyebrow:{fontSize:10,fontWeight:'800',letterSpacing:2,color:colors.rose},
  heroTitle:{fontSize:30,lineHeight:36,fontWeight:'800',color:colors.ink,letterSpacing:-0.8},
  heroSubtitle:{fontSize:14,color:colors.secondary,marginBottom:7},
  stats:{flexDirection:'row',gap:9,marginBottom:6},statBox:{flex:1,backgroundColor:colors.card,borderRadius:15,borderWidth:1,borderColor:colors.border,paddingVertical:14,paddingHorizontal:7,alignItems:'center',gap:3},
  statNum:{fontSize:23,fontWeight:'800',color:colors.rose},
  headingRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8},
  link:{fontSize:13,fontWeight:'700',color:colors.rose},meta:{fontSize:12,color:colors.secondary,lineHeight:18},
  ideaCard:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:17,padding:12,flexDirection:'row',alignItems:'center',gap:10,minHeight:95},
  ideaIcon:{width:64,height:66,borderRadius:13,backgroundColor:'#F4EDE7',alignItems:'center',justifyContent:'center'},
  ideaTitle:{fontSize:15,fontWeight:'800',color:colors.ink},heartAction:{minWidth:32,minHeight:38,justifyContent:'center',alignItems:'center'},
  planRow:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,borderRadius:14,padding:15,flexDirection:'row',alignItems:'center',gap:10},
  planCard:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,borderRadius:17,padding:18,gap:7},
  dateLabel:{fontSize:13,fontWeight:'800',color:colors.rose},
  tabBar:{borderTopColor:colors.border,borderTopWidth:1,backgroundColor:colors.card,flexDirection:'row',justifyContent:'space-around',paddingTop:9,paddingBottom:Platform.OS==='ios'?7:12},
  tabItem:{alignItems:'center',gap:3,minWidth:60},tabLabel:{fontSize:11,color:colors.secondary},
  sectionCard:{borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,padding:17,gap:13,marginBottom:5},
  memberRow:{flexDirection:'row',alignItems:'center',gap:12},invite:{fontSize:29,fontWeight:'800',letterSpacing:3,color:colors.rose},
  input:{borderColor:colors.border,borderWidth:1,borderRadius:12,backgroundColor:colors.card,color:colors.ink,paddingHorizontal:14,paddingVertical:13,fontSize:15,minHeight:48},
  fieldLabel:{fontSize:11,fontWeight:'800',color:colors.secondary,letterSpacing:0.6},
  centeredForm:{paddingHorizontal:28,paddingVertical:38,flexGrow:1,justifyContent:'center',gap:18},
  btn:{paddingVertical:12,paddingHorizontal:16,borderRadius:12,alignItems:'center',justifyContent:'center',minHeight:43},
  btnPrimary:{backgroundColor:colors.rose},btnOutline:{borderWidth:1,borderColor:colors.border,backgroundColor:colors.card},
  btnSoft:{backgroundColor:colors.paleRose},btnSmall:{backgroundColor:colors.paleRose,paddingVertical:8},
  btnLabel:{fontSize:14,fontWeight:'800',color:colors.ink},
  chip:{paddingHorizontal:11,paddingVertical:6,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,alignSelf:'flex-start'},
  chipActive:{backgroundColor:colors.paleRose,borderColor:'#EBC7D0'},chipLabel:{fontSize:11,color:colors.secondary,fontWeight:'700'},
  modalScreen:{paddingHorizontal:22,paddingTop:28,paddingBottom:55,gap:15,maxWidth:680,width:'100%',alignSelf:'center'},
  empty:{borderColor:colors.border,borderWidth:1,borderStyle:'dashed',borderRadius:16,padding:25,alignItems:'center',gap:9,backgroundColor:'#FFFCFA'},
  emptyTitle:{fontSize:16,fontWeight:'800',color:colors.ink},
});
