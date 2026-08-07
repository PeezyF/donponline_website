(() => {
  const cfg = window.DONPONLINE_CONFIG || {};
  const client = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = selector => document.querySelector(selector);
  let user = null;
  let status = null;
  let messages = [];
  let channel = null;

  const toast = text => {
    const element = $('#community-toast');
    element.textContent = text;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 2800);
  };
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'DP';
  const formatTime = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

  function insertMention(handle) {
    const input = $('#message-input');
    const mention = `@${handle} `;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + mention + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + mention.length, start + mention.length);
    input.dispatchEvent(new Event('input'));
  }

  function renderBody(element, text) {
    text.split(/(@[a-z0-9][a-z0-9._]{2,23})/gi).forEach(part => {
      if (/^@[a-z0-9][a-z0-9._]{2,23}$/i.test(part)) {
        const mention = document.createElement('button');
        mention.type = 'button';
        mention.className = 'mention';
        mention.textContent = part;
        mention.title = `Mention ${part}`;
        mention.onclick = () => insertMention(part.slice(1).toLowerCase());
        element.append(mention);
      } else {
        element.append(document.createTextNode(part));
      }
    });
  }

  function render() {
    const list = $('#message-list');
    list.innerHTML = '';
    if (!messages.length) {
      list.innerHTML = '<p class="empty-chat">Be the first member to start the conversation.</p>';
      return;
    }
    messages.forEach(message => {
      const article = document.createElement('article');
      article.className = `message${message.is_own ? ' own' : ''}`;
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = initials(message.display_name);
      const content = document.createElement('div');
      const head = document.createElement('div');
      const name = document.createElement('strong');
      const handle = document.createElement('button');
      const time = document.createElement('time');
      const body = document.createElement('p');
      const actions = document.createElement('div');
      head.className = 'message-head';
      name.textContent = message.display_name;
      handle.type = 'button';
      handle.className = 'message-handle';
      handle.textContent = `@${message.handle}`;
      handle.title = `Mention @${message.handle}`;
      handle.onclick = () => insertMention(message.handle);
      time.textContent = formatTime(message.created_at);
      body.className = 'message-body';
      renderBody(body, message.body);
      actions.className = 'message-actions';
      head.append(name, handle);
      if (message.is_staff) {
        const staff = document.createElement('b');
        staff.textContent = 'STAFF';
        head.append(staff);
      }
      head.append(time);
      if (!message.is_own) {
        const report = document.createElement('button');
        report.type = 'button';
        report.textContent = 'REPORT';
        report.onclick = () => openReport(message.id);
        actions.append(report);
      }
      if (status?.is_admin) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'REMOVE';
        remove.onclick = () => moderate(message.id, 'delete');
        const mute = document.createElement('button');
        mute.type = 'button';
        mute.textContent = 'MUTE 24H';
        mute.onclick = () => moderate(message.id, 'mute_24h');
        actions.append(remove, mute);
      }
      content.append(head, body, actions);
      article.append(avatar, content);
      list.append(article);
    });
  }

  async function loadMessages() {
    const { data, error } = await client.rpc('list_community_messages', { p_limit: 100 });
    if (error) {
      $('#message-list').innerHTML = '<p class="empty-chat">The room could not load. Please refresh.</p>';
      return;
    }
    messages = data || [];
    render();
  }

  function openRules(required = false) {
    $('#accept-label').hidden = status?.accepted && !required;
    $('#accept-rules').hidden = status?.accepted && !required;
    $('#rules-dialog').showModal();
  }
  function openReport(id) {
    $('#report-message-id').value = id;
    $('#report-reason').value = '';
    $('#report-dialog').showModal();
  }
  async function moderate(id, action) {
    if (!confirm(action === 'delete' ? 'Remove this message?' : 'Mute this member for 24 hours?')) return;
    const { error } = await client.rpc('moderate_community_message', { p_message_id: id, p_action: action, p_reason: 'Community rules violation' });
    if (error) return toast(error.message);
    toast(action === 'delete' ? 'Message removed.' : 'Member muted for 24 hours.');
    await loadMessages();
  }

  async function init() {
    const { data: { user: signedInUser } } = await client.auth.getUser();
    user = signedInUser;
    if (!user) {
      $('#signin-state').hidden = false;
      return;
    }
    const [{ data: communityStatus, error: statusError }, { data: profile }] = await Promise.all([
      client.rpc('get_community_status'),
      client.from('profiles').select('display_name').eq('id', user.id).single()
    ]);
    if (statusError) {
      $('#signin-state').hidden = false;
      return;
    }
    status = communityStatus;
    $('#chat-app').hidden = false;
    $('#community-name').textContent = profile?.display_name || user.email.split('@')[0];
    $('#community-handle').textContent = `@${status.handle}`;
    $('#handle-input').value = status.handle;
    if (status.banned) {
      $('#community-status').textContent = 'COMMUNITY ACCESS SUSPENDED';
      $('#message-input').disabled = true;
      $('#send-message').disabled = true;
      $('#composer-status').textContent = status.reason || 'Contact member support for help.';
    } else if (status.muted_until && new Date(status.muted_until) > new Date()) {
      $('#community-status').textContent = 'READ ONLY';
      $('#message-input').disabled = true;
      $('#send-message').disabled = true;
      $('#composer-status').textContent = `Muted until ${formatTime(status.muted_until)}.`;
    } else {
      $('#community-status').textContent = status.is_admin ? 'STAFF · CONNECTED' : 'CONNECTED';
    }
    await loadMessages();
    if (!status.accepted) openRules(true);
    channel = client.channel('donponline-community').on('postgres_changes', { event: '*', schema: 'public', table: 'community_messages' }, () => loadMessages()).subscribe();
  }

  $('#message-input').addEventListener('input', event => $('#character-count').textContent = `${event.target.value.length} / 500`);
  $('#message-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#message-input');
    const button = $('#send-message');
    const body = input.value.trim();
    if (!body) return;
    button.disabled = true;
    $('#composer-status').textContent = 'Sending…';
    const { error } = await client.rpc('post_community_message', { p_body: body });
    button.disabled = false;
    if (error) {
      $('#composer-status').textContent = error.message;
      return;
    }
    input.value = '';
    $('#character-count').textContent = '0 / 500';
    $('#composer-status').textContent = '';
    await loadMessages();
  });
  $('#handle-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#handle-input');
    const message = $('#handle-status');
    const { data, error } = await client.rpc('set_community_handle', { p_handle: input.value });
    if (error) {
      message.textContent = error.message;
      return;
    }
    status.handle = data;
    input.value = data;
    $('#community-handle').textContent = `@${data}`;
    message.textContent = 'Handle saved.';
    toast(`You are now @${data}`);
    await loadMessages();
  });
  $('#accept-rules').addEventListener('click', async () => {
    if (!$('#accept-rules-check').checked) return toast('Check the box to agree to the rules.');
    const { error } = await client.rpc('accept_community_rules');
    if (error) return toast(error.message);
    status.accepted = true;
    $('#rules-dialog').close();
    toast('Welcome to the community room.');
  });
  $('#report-form').addEventListener('submit', async event => {
    event.preventDefault();
    const { error } = await client.rpc('report_community_message', { p_message_id: Number($('#report-message-id').value), p_reason: $('#report-reason').value.trim() });
    if (error) return toast(error.message);
    $('#report-dialog').close();
    toast('Report sent to the moderators.');
  });
  $('#rules-button').onclick = () => openRules();
  $('#sidebar-rules').onclick = () => openRules();
  $('#refresh-chat').onclick = loadMessages;
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
  addEventListener('pagehide', () => { if (channel) client.removeChannel(channel); });
  init().catch(() => { $('#signin-state').hidden = false; });
})();
