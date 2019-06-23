const express = require('express');
const fs = require('fs');
const request = require('request');
const rp = require('request-promise');
const cheerio = require('cheerio');
const XLSX = require('xlsx');

let app = express();
let data_json = { items: [] };

function make_api_call(url) {
    return rp({
        url: url,
        method: 'GET',
        json: true,
        // to return html type via `cheerio`
        transform: function (body) {
            return cheerio.load(body);
        }
    });
}

async function getTargetUrl() {
    // we only want to scrape 100 pages of that website
    console.log('\nStart getting target urls......\n');
    for (let i = 1; i <= 100; i++) {
        // define the url of target urls
        let route = (i === 1) ? `` : `/page-${i}`;
        let url = `http://cn.sggp.org.vn/search/5Lit5ZyL/%E4%B8%AD%E5%9C%8B${route}.html`;

        let $ = await make_api_call(url);
        $('.story.story-horizontal > header').filter(function() {
            let json = { title: "", link: "" };
            let title, link = 'http://cn.sggp.org.vn';
            let self = $(this);

            title = self.find('.title > a').text().trim();
            link += self.find('.title > a').attr('href').trim();

            json.title = title;
            json.link = encodeURI(link); // encode url
            data_json.items.push(json);
        });

        // check progress
        console.log(` // ${i} data done.`);
    }
}

async function getData(data) {
    let result_arr = [];

    // we only want to scrape 100 pages of that website (10 data per page)
    console.log('\nStart getting data......\n');
    let len = data.length;
    for (let i = 0; i < len; i++) {
        let title = data[i].title, link = data[i].link;

        let $ = await make_api_call(link);
        $('article.main-article').filter(function() {
            let json = { title: "", time: "", summary: "", content: "" };
            let title, time, summary, content;
            let self = $(this);

            title = self.find('header.article-hdr > h1.article-title.cms-title').text().trim();
            time = self.find('header.article-hdr > .meta time').text().trim();
            summary = self.find('header.article-hdr > .summary.cms-desc').text().trim();
            content = self.find('.article-content > .content.cms-body').text().trim();

            json.title = title;
            json.time = time;
            json.summary = summary;
            json.content = content;
            result_arr.push(json);
        });

        // check progress
        console.log(` // ${i+1} data done.`);
    }

    return result_arr;
}

function parseToExcel(_data) {
    // setting <th>
    let _headers = ['title', 'time', 'summary', 'content'];

    let headers = _headers
        // 為 `_headers` 加上對應的位置
        // [ { v: 'title', position: 'A1' },
        //   { v: 'time', position: 'B1' },
        //   { v: 'summary', position: 'C1' },
        //   { v: 'content', position: 'D1' } ]
        .map((v, i) => Object.assign({}, { v: v, position: String.fromCharCode(65 + i) + 1 }))
        // 轉換成 `worksheet` 所需的結構
        // { A1: { v: 'title' },
        //   B1: { v: 'time' },
        //   C1: { v: 'summary' },
        //   D1: { v: 'content' } }
        .reduce((prev, next) => Object.assign({}, prev, {
            [next.position]: { v: next.v }
        }), {});

    let data = _data
        // 對應 `headers` 的位置，產生對應的資料
        // [ [ { v: 'title-1', position: 'A2' },
        //     { v: 'time-1', position: 'B2' },
        //     { v: 'summary-1', position: 'C2' },
        //     { v: 'content-1', position: 'D2' } ],
        //   [ { v: 'title-2', position: 'A3' },
        //     { v: 'time-2', position: 'B3' },
        //     { v: 'summary-2', position: 'C3' },
        //     { v: 'content-2', position: 'D3' } ] ]
        .map((v, i) => _headers.map((k, j) => Object.assign({}, { v: v[k], position: String.fromCharCode(65 + j) + (i + 2) })))
        // 對剛才的結果進行降維處理 (2D array => 1D array)
        // [ { v: 'title-1', position: 'A2' },
        //   { v: 'time-1', position: 'B2' },
        //   { v: 'summary-1', position: 'C2' },
        //   { v: 'content-1', position: 'D2' },
        //   { v: 'title-2', position: 'A3' },
        //   { v: 'time-2', position: 'B3' },
        //   { v: 'summary-2', position: 'C3' },
        //   { v: 'content-2', position: 'D3' } ]
        .reduce((prev, next) => prev.concat(next))
        // 轉換成 `worksheet` 所需的結構
        //   { A2: { v: 'title-1' },
        //     B2: { v: 'time-1' },
        //     C2: { v: 'summary-1' },
        //     D2: { v: 'content-1' },
        //     A3: { v: 'title-2' },
        //     B3: { v: 'time-2' },
        //     C3: { v: 'summary-2' },
        //     D3: { v: 'content-2' } }
        .reduce((prev, next) => Object.assign({}, prev, {
            [next.position]: { v: next.v }
        }), {});

    // 合併 `headers` 和 `data`
    let output = Object.assign({}, headers, data);
    // 取得所有格子的位置
    let outputPos = Object.keys(output);
    // 計算範圍
    let ref = outputPos[0] + ':' + outputPos[outputPos.length - 1];

    // 建立 `workbook` 的對象
    let wb = {
        SheetNames: ['mySheet'],
        Sheets: {
            'mySheet': Object.assign({}, output, { '!ref': ref })
        }
    };

    XLSX.writeFile(wb, 'output_targetData.xlsx');
}

// STEP 1: get all target urls
app.get('/scrape/urls', async function(req, res) {
    await getTargetUrl();

    fs.writeFile('output_targetUrls.json', JSON.stringify(data_json, null, 4), function (err) {
        if (err) throw err;
        console.log('File successfully written! - Check your project directory for the output_targetUrls.json file');
    });

    res.send('Urls scraped. Check your console!');
});

// STEP 2: loop all urls to get what we need
app.get('/scrape/data', async function(req, res) {
    fs.readFile('output_targetUrls.json', async function(err, data) {
        if (err) throw err;
        let rawData = await getData(JSON.parse(data).items);
        parseToExcel(rawData);
        console.log('File successfully written! - Check your project directory for the output_targetData.xlsx file');
    });

    res.send('Data scraped. Check your console!');
});

app.listen('8087');
console.log('Magic is gonna happen on port 8087');
exports = module.exports = app;