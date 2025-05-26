import * as crypto from "node:crypto"
import "jsr:@std/dotenv/load";


const secret = Deno.env.get("SECRET")
if (secret == undefined){
throw new Deno.errors.NotFound("Please Provide a secret")
}


Deno.serve(async (req) => {

    const url = new URL(req.url);
    //console.log(url.pathname);
    
    if (url.pathname != '/pay/webhook/url'){
        throw new Deno.errors.NotFound("Route Not Found")
        
    }
    // deno-lint-ignore no-explicit-any
    let event: any
    if (req.body){
        event = await req.json()
       // console.log(items);
        
    }

    const hash = crypto.createHmac('sha512',secret).update(JSON.stringify(event)).digest('hex')
    console.log(hash);
    
   if (hash == req.headers.get('x-paystack-signature')){
    //Use the event after validating the request
    console.log(event);
    
   }

    console.log("Not validated");
    
    return new Response("OK",{status:200});

});