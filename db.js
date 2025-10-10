const mongoose=require('mongoose');
const uri="mongodb+srv://moiz21:moiz21@cluster0.hpfykxj.mongodb.net/faisal?retryWrites=true&w=majority";
const connecttomongo=()=>
{
    mongoose.connect(uri).then((data)=>{
        console.log('Connected to databse successfully '+ data.Connection.name)
    }).catch((err)=>{
        console.log(err);
    })
};
module.exports=connecttomongo;
