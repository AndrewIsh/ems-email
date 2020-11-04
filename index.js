const Email = require('email-templates');
const nodemailer = require('nodemailer');

const db = require('../ems-db');

const pageSize = 100;
const result = {};
const email = new Email();

console.log(`Starting email job at ${new Date().toISOString()}`);

let smtpOptions = JSON.parse(process.env.SMTP_OPTIONS);
smtpOptions = {...smtpOptions, send: true};
const transporter = nodemailer.createTransport(smtpOptions);

const doPage = async (offset = 0) => {
    console.log(`Retrieving queries ${offset} - ${offset + pageSize}`);
    const queriesResult = await db.resolvers.queries.allQueries({
        query: { limit: pageSize, offset},
        user: { role_code: 'STAFF'}
    });
    console.log(`Received ${queriesResult.rowCount} queries`);

    if (queriesResult.rowCount === 0) {
        return;
    }

    // Get all queries
    const queries = queriesResult.rows;
    // We need the IDs of all queries we received
    const query_ids = queries.map((query) => query.id);
    // Now get the initiators for all the queries we've
    // received, we also receive their associated query ID
    const initiators = await db.resolvers.queries.initiators(query_ids);
    // Now get the participants of all retrieved queries
    const participants = await db.resolvers.queries.participants(query_ids);
    // Get all query user relationships
    const queryUser = await db.resolvers.queryuser.allUserQueries();

    // Iterate each query (we use 'for' so we iterate in sequence)
    for (const query of queries) {
        const messages = await db.resolvers.messages.allMessages(
            { query: { query_id: query.id } }
        );
        // The participants of this query
        const allUsers = participants.rows
            .filter((participant) => participant.query_id === query.id)
            .map((final) => final.creator_id);
       
        // Iterate each user
        allUsers.forEach((userId) => {
            // Get the most_recent_seen & most_recent_digest for this
            // user/query combination
            const currentState = queryUser.rows.find(
                (qU) => qU.query_id === query.id && qU.user_id === userId
            );
            if (!currentState) return;
            const highMark = currentState.most_recent_seen > currentState.most_recent_digest ?
                currentState.most_recent_seen : currentState.most_recent_digest;
            // Get the messages that occurred after this point that were not sent by
            // this user (we shouldn't get any that were sent by this user because their
            // highMark would be higher, but just to be sure)
            // We sort them by ID so we can establish the new high mark
            const newMessages = messages.rows.filter(
                (message) => message.id > highMark && message.creator_id !== userId
            ).sort((a, b) => a.id - b.id);
            if (newMessages.length > 0) {
                const maxId = newMessages[newMessages.length - 1].id;
                const newResult = {
                    id: query.id,
                    title: query.title,
                    messageCount: newMessages.length,
                    highMark: maxId,
                    userId
                };
                if (result[userId]) {
                    result[userId] = [...result[userId], newResult];
                } else {
                    result[userId] = [newResult];
                }
            }
        });
    };
    await doPage(offset + pageSize + 1);
};

const updateMostRecent = async (queries) => {
    console.log(`Updating most_recent_digest for ${queries.length} queries`);
    return await db.resolvers.queryuser.updateMostRecentDigests(queries);
};

const sendEmail = async ({to, name, queries}) => {
    try {
        let content = await email.renderAll(process.env.SCHEMA, {
            name,
            queries
        });
        content = {
            ...content,
            from: process.env.EMAIL_FROM,
            to
        }
        const result = transporter.sendMail(content).then(async () => {
            // Only update the high mark if the mail send succeeded
            await updateMostRecent(queries);
        });
        return result;
    } catch(err) {
        console.log(`Email sending failed with ${err}`);
        return Promise.reject(err);
    }
};

const processUsers = async () => {
    // Iterate each user (we use 'for' so we iterate in sequence, this
    // is not strictly necessary, but will make for easier to read logs)
    for (const id of Object.keys(result)) {
        const user = await db.resolvers.users.getUser({ params: { id } });
        console.log(`Retrieved user with ID ${user.rows[0].id}`);
        const encryptedEmail = user.rows[0].email;
        if (!encryptedEmail || encryptedEmail.length === 0) {
            console.log('-- User does not have an email address');
            continue;
        }
        const queries = result[id].map((query) => 
            ({
                url: `${process.env.BASE_URL}/query/${query.id}`,
                query
            })
        );

        const email = await db.resolvers.users.getUserEmail(encryptedEmail);
        console.log('Sending email');
        await sendEmail({to: email, name: user.rows[0].name, queries});
    }

};

const send = async (offset) => {

    // Compile users to be notified
    await doPage(offset);

    console.log(`Completed compiling ${Object.keys(result).length} users to be notified`);
    if (Object.keys(result).length === 0) {
        console.log('Nothing to do');
        console.log(`Ended email job at ${new Date().toISOString()}`);
        return;
    }

    await processUsers();

    console.log(`Ended email job at ${new Date().toISOString()}`);
};

send();

