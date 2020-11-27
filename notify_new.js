const db = require('../ems-db');

const { sendEmail } = require('./lib');

const result = {};

const init = async () => {

    console.log(`Starting new query email job at ${new Date().toISOString()}`);

    // Get any queries that have not yet been dealt with
    const unhandled = await db.resolvers.queries.unhandledQueries();
    console.log(`Received ${unhandled.rowCount} unhandled queries`);

    if (unhandled.rowCount === 0) {
        console.log('Nothing to do');
        console.log(`Ended new query email job at ${new Date().toISOString()}`);
        return;
    }

    const allStaff = await db.resolvers.users.allStaff();
    const staffIds = allStaff.rows.map((staff) => staff.id);
    // Iterate each query (we use 'for' so we iterate in sequence)
    for (const query of unhandled.rows) {
        // For a given query, find out which staff have had no interaction with it
        // (including being notified of it)
        // Get all users that have a queryuser entry for this query
        const participants = await db.resolvers.queryuser.getParticipantCounts({
            query_id: query.id
        });
        // Filter the participants that are staff and have no record of
        // having seen or been notified of this query
        // Return an array of user IDs
        const unengaged = participants.rows.filter((participant) => {
            return staffIds.indexOf(participant.user_id) >= 0 &&
                participant.most_recent_seen === 0 &&
                participant.most_recent_digest === 0;
        }).map((result) => result.user_id);
        if (unengaged.length > 0) {
            // Establish the ID of the most recent message
            const messages = await db.resolvers.messages.allMessages(
                { query: { query_id: query.id } }
            );
            const highMark = messages.rows[messages.rows.length - 1].id;
            unengaged.forEach((userId) => {
                const newResult = {
                    id: query.id,
                    title: query.title,
                    messageCount: messages.rows.length,
                    highMark,
                    userId
                };
                if (result[userId]) {
                    result[userId] = [...result[userId, newResult]];
                } else {
                    result[userId] = [newResult];
                }
            });
        } else {
            console.log(`No staff need notifying for query ${query.id}`);
        }
    }

    // Iterate each user (we use 'for' so we iterate in sequence, this
    // is not strictly necessary, but will make for easier to read logs)
    for (const userId of Object.keys(result)) {
        const user = allStaff.rows.find(
            (findUser) => parseInt(findUser.id) === parseInt(userId)
        );
        console.log(`Retrieved user with ID ${user.id}`);
        const encryptedEmail = user.email;
        if (!encryptedEmail || encryptedEmail.length === 0) {
            console.log('-- User does not have an email address');
            continue;
        }
        const queries = result[userId].map((query) => 
            ({
                url: `${process.env.BASE_URL}/query/${query.id}`,
                query
            })
        );

        console.log(`Notifying user ${user.id} of ${queries.length} new quer${queries.length === 1 ? 'y' : 'ies'}`);
        const email = await db.resolvers.users.getUserEmail(encryptedEmail);
        console.log('Sending email');
        await sendEmail({to: email, name: user.name, queries, type: 'new-query'});
    }

    console.log(`Ended new query email job at ${new Date().toISOString()}`);
}

module.exports = { init };

