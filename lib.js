const Email = require('email-templates');
const nodemailer = require('nodemailer');

const db = require('../ems-db');

const email = new Email();
let smtpOptions = JSON.parse(process.env.SMTP_OPTIONS);
smtpOptions = {...smtpOptions, send: true};
const transporter = nodemailer.createTransport(smtpOptions);

const sendEmail = async ({to, name, queries, type}) => {
    try {
        let content = await email.renderAll(`${process.env.SCHEMA}/${type}`, {
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

const updateMostRecent = async (queries) => {
    console.log(`Updating most_recent_digest for ${queries.length} queries`);
    return await db.resolvers.queryuser.updateMostRecentDigests(queries);
};

module.exports = { sendEmail };