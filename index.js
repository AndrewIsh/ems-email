const { init: updatedQueries } = require('./notify_updates');
const { init: newQueries } = require('./notify_new');

const run = async () => {
    await updatedQueries();
    await newQueries();
};

run();