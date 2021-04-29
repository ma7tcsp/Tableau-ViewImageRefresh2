var express = require('express');
var app = express();
var path = require('path');
const bodyParser = require('body-parser');
const https = require('https');
const http = require('http');
var xml2js  = require('xml2js');
var cors = require('cors');
var fs = require('fs');
const { json } = require('express');
Stream = require('stream').Transform;
const PAGE_SIZE=1000;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

app.listen(port, function () {
  console.log('Example app listening on port '+port);
});
app.get('/refresh', async function (req, res) {
  try {
    await deleteImg();
    authenticate().then(async (resauth)=>{
      try {
        var v=await dumpViewPics(resauth.token,resauth.siteid);
        res.send("Job Done !");
      } catch (error) {
        console.log("err in dump",error);
      }
    });
  } catch (error) {
    console.log("err in auth or dump");
  }
})
app.get('/list', async function (req, res) {
  var project=req.query.proj;
  if(!project)
    project="default";
  var viewName=req.query.view;
  if(!viewName)
    return res.send("Missing 'view' parameter !!");
    return list(req.get('host'),'@@@Tableau Host@@@','@@@Site Name@@@',project,'@@@PAT Name@@@','@@@PAT Secret@@@',res,viewName);
});
app.post('/list', async function (req, res) {
  var m=validateParam(req,true);
  if(m!="")
    res.send({message:m});
  else
    return list(req.protocol+'://' +req.get('host'),req.body.host,req.body.site,req.body.project,req.body.tokenName,req.body.tokenValue,res,viewName);
})
app.post('/projects', async function (req, res) {
  var m=validateParam(req);
  if(m!="")
    res.send({message:m});
    else
      return listProjects(req.body.host,req.body.site,req.body.tokenName,req.body.tokenValue,res);
});

function validateParam(req,for_img){
  var mess=""
  if(!req.body.host){
    mess+="Missing 'host' key in post body"
  }
  if(req.body.host){
    try {
      const url = new URL(req.body.host);
    } catch (error) {
      mess+="Host error "+error +', requires full URL with port if not 80 or 443 like http://toto.com:8080';
    }
  }
  if(!req.body.site){
    mess+="<br>Missing 'site' key in post body"
  }
  if(for_img && !req.body.project){
    mess+="<br>Missing 'project' key in post body"
  }
  if(!req.body.tokenName){
    mess+="<br>Missing 'tokenName' key in post body"
  }
  if(!req.body.tokenValue){
    mess+="<br>Missing 'tokenValue' key in post body"
  }
  return mess;

}
function listProjects(rawhost,site,tokenName,tokenValue,res){
  try{
    const url = new URL(rawhost);
    var hostname=url.hostname;
    var protocol=url.protocol.replace(":","");
    var port=protocol=="https"?url.port==""?443:url.port:url.port==""?80:url.port;
    authenticate(hostname,protocol,port,site,tokenName,tokenValue).then(async (resa)=>{
      try {
        if(resa.error)
          res.send({message:resa.error});
        else{
          var projs=await getProjects(protocol,port,resa.token,hostname,resa.siteid);
          if(projs==null || projs.length==0){
            res.send({message:`No Project found...`});
            return;
          }
          var jso=[]
          projs[0].project.map((p)=>{
            jso.push(p.$);
          })
          res.json(jso);
        }
      } catch (err) {
        res.send({message:err});
      }
    });
  } catch (error){
    res.send({message:error});
  }
}
function list(myhost,rawhost,site,project,tokenName,tokenValue,res,viewName){
  try{
    const url = new URL(rawhost);
    var hostname=url.hostname;
    var protocol=url.protocol.replace(":","");
    var port=protocol=="https"?url.port==""?443:url.port:url.port==""?80:url.port;
    authenticate(hostname,protocol,port,site,tokenName,tokenValue).then(async (resa)=>{
      try {
        if(resa.error)
          res.send({message:resa.error});
        else{
          var vs=await dumpViewPics(protocol,port,resa.token,hostname,resa.siteid,project,viewName);
          if(vs==null){
            res.send({message:`Project not found "${project}"`});
            return;
          }
          var jso=[]
          vs.map((v)=>{
            var js={}
            js.id=v.id;
            js.name=v.name;
            js.link=v.url;
            js.url=myhost+"/"+resa.siteid+hashCode(project)+"/"+v.id+".png";
            jso.push(js);
          })
          res.json(jso);
        }
      } catch (err) {
        res.send({message:err});
      }
    });
  } catch (error){
    res.send({message:error});
  }
}
function deleteImg(){
  return new Promise( (resolve, reject)=>{
    const directory = "public/img/";
    var allDelete=[]
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      for (const file of files) {
        allDelete.push(unlink(path.join(directory, file)))
      }
      Promise.all(allDelete).then(()=>resolve());
    });
  })
}
function hashCode(str) {
  var hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}
function getImage(protocol,port,token, host,siteid, pat,viewid,wid) {
    return new Promise((resolve, reject)=>{
	    optionspath = encodeURI("/api/3.9/sites/" + siteid + "/views/" + viewid + "/image?maxAge=1&resolution=high");
      //optionspath = encodeURI("/api/3.9/sites/" + siteid + "/workbooks/"+wid+"/views/" + viewid + "/previewImage");
      //optionspath = encodeURI("/api/3.9/sites/" + siteid + "/views/" + viewid + "/image?maxAge=1&resolution=high");
      var imgdata = new Stream();
      const https = require('https');
      const options = {
        hostname: host,
        port: port,
        path: optionspath,
        encoding: 'null',
        method: 'GET',
        headers: {
          'x-tableau-auth': token
        }
      }
      var proto=protocol=="https"?https:http;
      const req = proto.request(options, res => {
        res.on('data', function(chunk) {
          imgdata.push(chunk)
        })
        res.on('end', function() {
          try {
            fs.writeFileSync(pat+'/'+viewid+'.png', imgdata.read());
            resolve();
          } catch (error) {
            fs.createReadStream('public/empty.png').pipe(fs.createWriteStream(pat+'/'+viewid+'.png'));
            console.log("error ",error)
          }
        })

      })
      req.end()
    })
}
function getFolder(pat){
  if (!fs.existsSync("public/"+pat)) {
    fs.mkdirSync("public/"+pat);
  }
  return "public/"+pat;
}
function dumpViewPics(protocol,port,token,host,site,project,viewName){
  var force=true;
  var deletion=false;
  return new Promise(async (resolve, reject)=>{
    var pid=await getProject(protocol,port,token,host,site,project);
    if(pid==null){
      resolve(pid);
      return;
    }
    var pageNumber=1;
    var vs=await getViews(protocol,port,token,host,site,pid,pageNumber,viewName);
    var retrieved=0;
    var allViews=[]
    if(vs)
      while (retrieved<vs.total){
        var temp= await getViews(protocol,port,token,host,site,pid,pageNumber,viewName);
        retrieved+=temp.retrieved;
        allViews=allViews.concat(temp.views);
        pageNumber=pageNumber+1;
      }
    views=allViews;
    var existing=[];
    var mypath=getFolder(site+ hashCode(project)+'/');
    fs.readdir(mypath, (err, files) => {
      files.forEach(file => {
        existing.push(file)
      });
      var missingViews = [];
      var allImg=[];
      if(force==true){
        views.map((v)=>{
          allImg.push(getImage(protocol,port,token,host,site,mypath,v.id,v.wid));
          console.log(v.id, "picture has been added! (forced)")
        })
      }
      else{
        if(views)
          missingViews=views.filter(function(val) {
            var found=false;
            existing.map((ff)=>{
              if(ff.indexOf(val.id)!=-1)
                found=true;
            })
            return !found;
          });
        if(missingViews)
          missingViews.map((v)=>{
            allImg.push(getImage(protocol,port,token,host,site,mypath,v.id,v.wid));
            console.log(v.id, "picture has been added!")
          })
      }
      Promise.all(allImg).then(()=>{
        resolve(views);
      })
      var extraFiles = []
      //manage extra files to be deleted or not...
      if(views && deletion==true){
        extraFiles= existing.filter(function(val) {
          var isThere=true;
          views.map((vv)=>{
            if(val.indexOf(vv.id)!=-1){
              isThere= false
              return;
            }

          })
          return isThere;
        });
        extraFiles.map((del)=>{
          try {
            fs.unlinkSync(mypath+del);
            console.log(del,"picture has been deleted!")
          } catch(err) {
            console.error(err)
          }
        })
      }

    });
  })
}
function getProjects(protocol,port,token, host,siteid) {
  return new Promise((resolve, reject)=>{
    optionspath = encodeURI("/api/3.9/sites/" + siteid + "/projects?pageSize="+PAGE_SIZE);
    var xmldata = "";
    const https = require('https');
    const options = {
      hostname: host,
      port: port,
      path: optionspath,
      method: 'GET',
      headers: {
        'x-tableau-auth': token
      }
    }
    var proto=protocol=="https"?https:http;
    const req = proto.request(options, res => {
      res.on('data', function(chunk) {
        xmldata += chunk;
      })
      res.on('end', function() {
        var parser = new xml2js.Parser();
        parser.parseString(xmldata, function(err, parsedXml) {
          if(parsedXml.tsResponse.projects){
            var res = parsedXml.tsResponse.projects;
            resolve (res);
          }
          else{
            resolve (null);
          }
          });
      })
    })
    req.end()
  })
}
function getProject(protocol,port,token, host,siteid, projectName) {
  return new Promise((resolve, reject)=>{
    optionspath = encodeURI("/api/3.9/sites/" + siteid + "/projects?pageSize="+PAGE_SIZE);
    var xmldata = "";
    const https = require('https');
    const options = {
      hostname: host,
      port: port,
      path: optionspath,
      method: 'GET',
      headers: {
        'x-tableau-auth': token
      }
    }
    var proto=protocol=="https"?https:http;
    const req = proto.request(options, res => {
      res.on('data', function(chunk) {
        xmldata += chunk;
      })
      res.on('end', function() {
        var parser = new xml2js.Parser();
        parser.parseString(xmldata, function(err, parsedXml) {
          if(parsedXml.tsResponse.projects){
            var res = parsedXml.tsResponse.projects[0].project;
            var id=null
            res.map((p)=>{
              if(p.$.name.toLowerCase()==projectName.toLowerCase())
                id=p.$.id;
            })
            resolve (id);
          }
          else{
            resolve (null);
          }
          });
      })
    })
    req.end()
  })
}
function getViews(protocol,port,token,host,siteid,projectID,pageNumber,viewName) {
  return new Promise((resolve, reject)=>{
    var vs=[];
    optionspath = encodeURI("/api/3.9/sites/" + siteid + "/views?pageSize="+PAGE_SIZE+"&pageNumber="+pageNumber);
    var xmldata = "";
    const https = require('https');
    const options = {
      hostname: host,
      port: port,
      path: optionspath,
      method: 'GET',
      headers: {
        'x-tableau-auth': token
      }
    }
    var proto=protocol=="https"?https:http;
    const req = proto.request(options, res => {
      res.on('data', function(chunk) {
        xmldata += chunk;
      })
      res.on('end', function() {
        var parser = new xml2js.Parser();
        parser.parseString(xmldata, function(err, parsedXml) {
          if(parsedXml.tsResponse.views){
            var res = parsedXml.tsResponse.views[0].view;
            if(res)
              res.map((v)=>{
                if(projectID && v.$ && v.project[0].$.id==projectID){
                  if(viewName && v.$.name==viewName)
                  vs.push({"id":v.$.id,"wid":v.workbook[0].$.id,"name":v.$.name,"url":v.$.contentUrl});
                }
              })
            resolve ({views:vs,retrieved:res.length,total:parsedXml.tsResponse.pagination?parsedXml.tsResponse.pagination[0].$.totalAvailable:0});
          }
          else{
            console.log("err in getviews",projectID);
            resolve (null);
          }
        });
      })
    })
    req.end()
  })
}
function authenticate(host,protocol,port,site,tokenName,tokenValue) {
  return new Promise((resolve, reject)=>{
    try {
      var xmldata = "";
      site=site.toLowerCase()=="default"?"":site;
      var postdata = `<tsRequest><credentials personalAccessTokenName='${tokenName}' personalAccessTokenSecret='${tokenValue}'><site contentUrl='${site}' /></credentials></tsRequest>`;
      var options = {
        hostname: `${host}`,
        port: port,
        path: '/api/3.9/auth/signin',
        method: 'POST',
        headers: {
          'Content-Type': 'text/json',
          'Content-Length':postdata.length
        }
      }
      var proto=protocol=="https"?https:http;
      const req = proto.request(options, res => {
        res.on('data', function(chunk) {
          xmldata += chunk;
        })
        res.on('end', function() {
          var parser = new xml2js.Parser();
          parser.parseString(xmldata, function(err, parsedXml) {
            if(parsedXml.tsResponse.credentials){
              var token = parsedXml.tsResponse.credentials[0].$.token;
              var siteid = parsedXml.tsResponse.credentials[0].site[0].$.id;
              resolve ({token:token,siteid:siteid})
            } else{
              resolve({error:parsedXml.tsResponse.error[0].summary.join(',') +' / ' +parsedXml.tsResponse.error[0].detail.join(',')})
            }
          });
        })
    })
    req.on('error', function(err) {
      resolve({error:`${err}`})
    })
    req.write(postdata);
    req.end();
  } catch (error) {
    reject ({"error":error});
  }
  })

}

app.use(express.static(path.join(__dirname, "/public")));
