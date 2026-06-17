const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { checkAnswer } = require('./answerChecker');

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN                = process.env.DISCORD_TOKEN;
const QUIZ_CHANNEL_ID      = process.env.QUIZ_CHANNEL_ID;
const ADMIN_USER_ID        = process.env.ADMIN_USER_ID;
const QUESTION_TIMEOUT_SEC = parseInt(process.env.QUESTION_TIMEOUT_SEC || '60');
const SPEED_BONUS_SEC      = parseInt(process.env.SPEED_BONUS_SEC      || '15');

// ── Questions ─────────────────────────────────────────────────────────────────
const ALL_QUESTIONS = require('./data/questions.json');

// ── Persistance JSON (remplace SQLite pour Railway) ───────────────────────────
const DATA_FILE = path.join(__dirname, 'quiz_data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { scores: {}, usedQuestions: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { scores: {}, usedQuestions: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── State ─────────────────────────────────────────────────────────────────────
let activeQuestion = null;
/*
activeQuestion = {
  question:     { n, cat, diff, q, a },
  startedAt:    timestamp (ms),
  answered:     Set<userId>,
  firstCorrect: userId | null,
  timer:        setTimeout ref
}
*/

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickRandomQuestion() {
  const data = loadData();
  const available = ALL_QUESTIONS.filter(q => !data.usedQuestions.includes(q.n));

  let q;
  if (available.length === 0) {
    // Toutes posées → reset
    data.usedQuestions = [];
    q = ALL_QUESTIONS[Math.floor(Math.random() * ALL_QUESTIONS.length)];
  } else {
    q = available[Math.floor(Math.random() * available.length)];
  }

  data.usedQuestions.push(q.n);
  saveData(data);
  return q;
}

function recordAnswer(userId, username, pts, isCorrect) {
  const data = loadData();
  if (!data.scores[userId]) {
    data.scores[userId] = { username, points: 0, correct: 0, answered: 0 };
  }
  data.scores[userId].username  = username;
  data.scores[userId].points   += pts;
  data.scores[userId].answered += 1;
  if (isCorrect) data.scores[userId].correct += 1;
  saveData(data);
}

const DIFF_EMOJI = { facile: '🟢', moyen: '🟡', difficile: '🟠', expert: '🔴' };
const CAT_EMOJI  = {
  nutrition: '🥩', hydratation: '💧', entrainement: '🏋️',
  recuperation: '😴', hormones: '⚗️', sommeil: '🌙', stress: '🔥'
};

function buildQuestionEmbed(q, usedCount) {
  const diff  = DIFF_EMOJI[q.diff] || '';
  const cat   = CAT_EMOJI[q.cat]  || '';
  const total = ALL_QUESTIONS.length;
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`❓ Question #${q.n}`)
    .setDescription(`**${q.q}**`)
    .addFields(
      { name: 'Catégorie',   value: `${cat} ${q.cat.charAt(0).toUpperCase()+q.cat.slice(1)}`, inline: true },
      { name: 'Difficulté',  value: `${diff} ${q.diff}`,                                       inline: true },
      { name: '⏱️ Temps',   value: `${QUESTION_TIMEOUT_SEC}s`,                                 inline: true }
    )
    .setFooter({ text: `${usedCount}/${total} questions posées · Réponds en DM ! ⚡ Bonus vitesse = 2 pts dans les ${SPEED_BONUS_SEC}s` });
}

async function closeQuestion(reason = 'timeout') {
  if (!activeQuestion) return;
  const { question } = activeQuestion;
  clearTimeout(activeQuestion.timer);
  activeQuestion = null;

  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(reason === 'timeout' ? 0xED4245 : 0x57F287)
      .setTitle(`⏹️ Question #${question.n} — Terminée`)
      .setDescription(`**Réponse officielle :**\n${question.a}`)
      .setFooter({ text: 'Tape !réponse pour voir le classement.' });
    await channel.send({ embeds: [embed] }).catch(console.error);
  }
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL', 'MESSAGE'],
});

client.on('ready', () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  console.log(`   Salon quiz : ${QUIZ_CHANNEL_ID}`);
  console.log(`   Admin      : ${ADMIN_USER_ID}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const cmd = message.content.trim().toLowerCase();

  // ── !question ─────────────────────────────────────────────────────────────
  if (cmd === '!question') {
    if (message.channel.id !== QUIZ_CHANNEL_ID) return;
    if (message.author.id !== ADMIN_USER_ID) {
      return message.reply('❌ Seul l\'hôte peut lancer une question !');
    }
    if (activeQuestion) {
      return message.reply('⚠️ Une question est déjà en cours !');
    }

    const q    = pickRandomQuestion();
    const used = loadData().usedQuestions.length;

    activeQuestion = {
      question:     q,
      startedAt:    Date.now(),
      answered:     new Set(),
      firstCorrect: null,
      timer:        null,
    };

    await message.channel.send({
      content: `📢 **Nouvelle question !** — Répondez en **DM avec le bot** dans les **${QUESTION_TIMEOUT_SEC}s** !`,
      embeds:  [buildQuestionEmbed(q, used)],
    });

    activeQuestion.timer = setTimeout(() => closeQuestion('timeout'), QUESTION_TIMEOUT_SEC * 1000);
    return;
  }

  // ── !réponse / !reponse / !leaderboard ────────────────────────────────────
  if (['!réponse', '!reponse', '!leaderboard'].includes(cmd)) {
    const data   = loadData();
    const sorted = Object.entries(data.scores)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.points - a.points || b.correct - a.correct)
      .slice(0, 20);

    if (!sorted.length) {
      return message.reply('Aucune réponse enregistrée pour l\'instant.');
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines  = sorted.map((r, i) => {
      const medal = medals[i] || `**#${i + 1}**`;
      return `${medal} **${r.username}** — ${r.points} pts  *(${r.correct}/${r.answered} correctes)*`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('👑 Classement IQLET')
      .setDescription(lines.join('\n'))
      .setFooter({ text: '1 pt bonne réponse · 2 pts si le plus rapide (dans les ' + SPEED_BONUS_SEC + 's)' });

    return message.reply({ embeds: [embed] });
  }

  // ── !stop ─────────────────────────────────────────────────────────────────
  if (cmd === '!stop') {
    if (message.author.id !== ADMIN_USER_ID) return;
    if (!activeQuestion) return message.reply('Aucune question en cours.');
    await closeQuestion('manual');
    return message.reply('⏹️ Question annulée.');
  }

  // ── !reset ────────────────────────────────────────────────────────────────
  if (cmd === '!reset') {
    if (message.author.id !== ADMIN_USER_ID) return;
    if (activeQuestion) { clearTimeout(activeQuestion.timer); activeQuestion = null; }
    saveData({ scores: {}, usedQuestions: [] });
    return message.reply('✅ Scores et questions remis à zéro.');
  }

  // ── !resetquestions (remet seulement le pool de questions, garde les scores) ─
  if (cmd === '!resetquestions') {
    if (message.author.id !== ADMIN_USER_ID) return;
    const data = loadData();
    data.usedQuestions = [];
    saveData(data);
    return message.reply('✅ Pool de questions remis à zéro (scores conservés).');
  }

  // ── !snipe ────────────────────────────────────────────────────────────────
  if (cmd.startsWith('!snipe')) {
    if (message.channel.type === 1) return; // Ignorer les DMs
    if (message.author.id !== ADMIN_USER_ID) {
      return message.reply('❌ Seul l\'hôte peut utiliser cette commande !');
    }

    const args     = message.content.trim().split(/\s+/);
    const targetId = message.mentions.users.first()?.id || args[1]?.replace(/\D/g, '');
    if (!targetId) return message.reply('Usage : `!snipe @user` ou `!snipe <userID>`');

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) return message.reply(`Utilisateur introuvable pour l'ID \`${targetId}\`.`);

    const statusMsg = await message.reply(`🔍 Scan en cours des messages de **${targetUser.tag}**...`);

    const textChannels = message.guild.channels.cache.filter(ch =>
      ch.isTextBased() && !ch.isVoiceBased() &&
      ch.permissionsFor(message.guild.members.me)?.has(PermissionsBitField.Flags.ViewChannel) &&
      ch.permissionsFor(message.guild.members.me)?.has(PermissionsBitField.Flags.ReadMessageHistory)
    );

    for (const [, ch] of textChannels) {
      try { await ch.messages.fetch({ limit: 100 }); } catch { /* inaccessible */ }
    }

    const collectedMessages = [];
    for (const [, ch] of textChannels) {
      const msgs = ch.messages.cache.filter(m => m.author.id === targetId);
      for (const [, m] of msgs) {
        collectedMessages.push({
          id:          m.id,
          channelId:   ch.id,
          content:     m.content || '*[Pas de texte]*',
          createdAt:   m.createdTimestamp,
          url:         m.url,
          attachments: m.attachments.size,
        });
      }
    }

    collectedMessages.sort((a, b) => b.createdAt - a.createdAt);

    if (collectedMessages.length === 0) {
      return statusMsg.edit({ content: null, embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔍 Aucun message trouvé')
        .setDescription(`Aucun message de <@${targetId}> n'est présent dans le cache actuel.\n> *Seuls les messages récents (chargés en cache) sont visibles.*`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setTimestamp()] });
    }

    const PAGE_SIZE  = 10;
    const totalPages = Math.ceil(collectedMessages.length / PAGE_SIZE);
    const sessionId  = `snipe_${message.id}`;

    if (!client._snipeSessions) client._snipeSessions = new Map();
    client._snipeSessions.set(sessionId, { messages: collectedMessages, page: 0, totalPages, targetId, targetTag: targetUser.tag });

    function buildPage(page) {
      const slice = collectedMessages.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      const fields = slice.map((m, i) => {
        const ts      = `<t:${Math.floor(m.createdAt / 1000)}:R>`;
        const preview = m.content.length > 120 ? m.content.slice(0, 117) + '...' : m.content;
        const attach  = m.attachments > 0 ? ` 📎×${m.attachments}` : '';
        return { name: `#${page * PAGE_SIZE + i + 1} · <#${m.channelId}> · ${ts}`, value: `${preview}${attach}\n[Voir le message](${m.url})`, inline: false };
      });
      return new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle(`🎯 Snipe — ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(`**${collectedMessages.length} message(s) trouvé(s)** · Page ${page + 1}/${totalPages}`)
        .addFields(fields)
        .setFooter({ text: `ID : ${targetId}` })
        .setTimestamp();
    }

    function buildButtons(page) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${sessionId}_prev`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${sessionId}_next`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        new ButtonBuilder().setCustomId(`${sessionId}_delete`).setLabel(`🗑️ Tout supprimer (${collectedMessages.length})`).setStyle(ButtonStyle.Danger),
      );
    }

    await statusMsg.edit({ content: null, embeds: [buildPage(0)], components: [buildButtons(0)] });

    const collector = statusMsg.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== ADMIN_USER_ID) {
        return interaction.reply({ content: 'Seul l\'hôte peut utiliser ces boutons.', ephemeral: true });
      }

      const session = client._snipeSessions?.get(sessionId);
      if (!session) return interaction.reply({ content: 'Session expirée.', ephemeral: true });

      const action = interaction.customId.split('_').pop();

      if (action === 'prev') {
        session.page = Math.max(0, session.page - 1);
        return interaction.update({ embeds: [buildPage(session.page)], components: [buildButtons(session.page)] });
      }
      if (action === 'next') {
        session.page = Math.min(totalPages - 1, session.page + 1);
        return interaction.update({ embeds: [buildPage(session.page)], components: [buildButtons(session.page)] });
      }
      if (action === 'delete') {
        await interaction.deferUpdate();
        await statusMsg.edit({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏳ Suppression en cours...').setDescription(`Suppression de **${session.messages.length}** messages...`).setTimestamp()], components: [] });

        let deleted = 0, failed = 0;
        for (const msgData of session.messages) {
          try {
            const ch = await client.channels.fetch(msgData.channelId).catch(() => null);
            const m  = ch ? await ch.messages.fetch(msgData.id).catch(() => null) : null;
            if (m) { await m.delete(); deleted++; }
            else failed++;
            await new Promise(r => setTimeout(r, 300));
          } catch { failed++; }
        }

        client._snipeSessions.delete(sessionId);
        collector.stop('deleted');

        await statusMsg.edit({ embeds: [new EmbedBuilder()
          .setColor(failed > 0 ? 0xFFA500 : 0x57F287)
          .setTitle('✅ Suppression terminée')
          .setDescription(`Messages de **${session.targetTag}** supprimés.`)
          .addFields(
            { name: '✅ Supprimés', value: `${deleted}`, inline: true },
            { name: '❌ Échecs',    value: `${failed}`,  inline: true },
          )
          .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `ID cible : ${session.targetId}` })
          .setTimestamp()], components: [] });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'deleted') {
        client._snipeSessions?.delete(sessionId);
        statusMsg.edit({ components: [] }).catch(() => {});
      }
    });
    return;
  }

  // ── DM → réponse ──────────────────────────────────────────────────────────
  if (message.channel.type === 1) { // 1 = DM_CHANNEL
    if (!activeQuestion) {
      return message.reply('Aucune question en cours pour l\'instant ! Guette le salon quiz 👀');
    }

    const userId   = message.author.id;
    const username = message.author.username;

    if (activeQuestion.answered.has(userId)) {
      return message.reply('Tu as déjà répondu à cette question !');
    }

    activeQuestion.answered.add(userId);

    const correct = checkAnswer(message.content.trim(), activeQuestion.question.a);
    const elapsed = (Date.now() - activeQuestion.startedAt) / 1000;
    const isFirst = correct && activeQuestion.firstCorrect === null && elapsed <= SPEED_BONUS_SEC;

    if (correct) {
      const pts = isFirst ? 2 : 1;
      if (activeQuestion.firstCorrect === null) activeQuestion.firstCorrect = userId;
      recordAnswer(userId, username, pts, true);

      await message.reply(
        isFirst
          ? `⚡ **Bonne réponse ET le plus rapide !** +2 pts 🎉\n*(en ${elapsed.toFixed(1)}s)*`
          : `✅ **Bonne réponse !** +1 pt`
      );

      const channel = await client.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
      if (channel) {
        channel.send(
          isFirst
            ? `⚡ **${username}** a été le plus rapide ! *(${elapsed.toFixed(1)}s)* — **+2 pts**`
            : `✅ **${username}** a trouvé ! **+1 pt**`
        ).catch(console.error);
      }
    } else {
      recordAnswer(userId, username, 0, false);
      await message.reply('❌ **Mauvaise réponse.** 0 pt');
    }
  }
});

client.login(TOKEN);
