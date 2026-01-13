// use wasm_bindgen::prelude::*;
// use serde::{Serialize, Deserialize};

// #[derive(Serialize, Deserialize)]
// pub struct Row {
//     pub id: String,
//     pub total: f64,
// }

// #[wasm_bindgen]
// pub fn process(data: JsValue) -> JsValue {
//     let rows: Vec<Vec<String>> =a
//         serde_wasm_bindgen::from_value(data).unwrap();

//     let mut result: Vec<Row> = rows.iter()
//         .filter(|r| r.len() >= 3 && r[2] != "VOID")
//         .map(|r| Row {
//             id: r[0].clone(),
//             total: r[1].parse::<f64>().unwrap_or(0.0) * 1.08,
//         })
//         .collect();

//     result.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap());
//     serde_wasm_bindgen::to_value(&result).unwrap()
// }



use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub bmi: f64,
    pub category: String,
    pub risk_level: String,
}

#[wasm_bindgen]
pub fn process(data: JsValue) -> JsValue {
    let rows: Vec<Vec<String>> =
        serde_wasm_bindgen::from_value(data).unwrap();

    let result: Vec<Person> = rows
        .iter()
        .skip(1) // ✅ skip header row
        .map(|r| Person {
            id: r[0].clone(),
            name: r[1].clone(),
            bmi: r[6].parse::<f64>().unwrap_or(0.0),
            category: r[7].clone(),
            risk_level: r[8].clone(),
        })
        .collect();

    serde_wasm_bindgen::to_value(&result).unwrap()
}
