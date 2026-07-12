require('dotenv').config();

const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const changePassword = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const admin = await Admin.findOne({
            email: 'admin@sbit.edu'
        });

        if (!admin) {
            console.log('❌ Super Admin not found');
            process.exit(1);
        }

        admin.password = process.env.SUPER_ADMIN_PASSWORD;

        // Your Admin model pre-save hook should bcrypt-hash this password
        await admin.save();

        console.log('✅ Super Admin password changed successfully');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

changePassword();